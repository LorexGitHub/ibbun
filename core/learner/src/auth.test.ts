import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeMail, type FakeMail } from "@ibbun/mail";
import * as t from "../db/learner-tables.ts";
import { createLearnerAuth, type LearnerAuth } from "./auth.ts";
import { createLearnerClient, type LearnerClient } from "./learner-client.ts";
import type { AuthEvent } from "./events.ts";
import { useLearnerDb } from "./db.testing.ts";

const APP = "http://localhost:5173";
const BREACHED = "password1234567";
const GOOD = "a long and unusual passphrase";
const WRONG_LOGIN = { ok: false, status: 401, message: "email or password is wrong" };

const pg = useLearnerDb();

/** Have I Been Pwned's range API, answering that BREACHED is breached. Records each prefix asked for. */
const pwnedPrefixes: string[] = [];
beforeEach(() => {
  pwnedPrefixes.length = 0;
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.host !== "api.pwnedpasswords.com") return realFetch(input, init);
    const prefix = url.pathname.split("/").pop()!;
    pwnedPrefixes.push(prefix);
    const sha1 = createHash("sha1").update(BREACHED).digest("hex").toUpperCase();
    const body = sha1.startsWith(prefix) ? `${sha1.slice(5)}:42\r\n0000000000000000000000000000000000A:1` : "";
    return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

type World = { auth: LearnerAuth; mail: FakeMail; events: AuthEvent[]; clock: { now: Date } };

const world = (overrides: { signupOpen?: boolean } = {}): World => {
  const mail = createFakeMail();
  const events: AuthEvent[] = [];
  const clock = { now: new Date() };
  const auth = createLearnerAuth({
    db: pg.db,
    mail,
    config: { secret: "s".repeat(32), appUrl: APP, signupOpen: overrides.signupOpen ?? true },
    log: (e) => void events.push(e),
    now: () => clock.now,
  });
  return { auth, mail, events, clock };
};

/** One browser: its own cookie jar and IP, talking to the auth handler in-process. */
type Browser = { client: LearnerClient; fetch: typeof fetch; cookies: Map<string, string> };

const browser = (auth: LearnerAuth, ip = `10.${rand()}.${rand()}.${rand()}`): Browser => {
  const cookies = new Map<string, string>();
  const fetchVia: typeof fetch = async (input, init) => {
    const request = new Request(new URL(String(input), APP), init);
    request.headers.set("origin", APP);
    request.headers.set("x-forwarded-for", ip);
    if (cookies.size) request.headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await auth.authHandler(request);
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(";");
      const [name, value] = pair!.split("=") as [string, string];
      if (value === "" || /max-age=0/i.test(set)) cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  };
  return { client: createLearnerClient({ baseUrl: `${APP}/api/auth`, fetch: fetchVia }), fetch: fetchVia, cookies };
};
const rand = () => Math.floor(Math.random() * 250) + 1;

const newEmail = () => `${randomUUID()}@ibbun.test`;

const linkIn = (mail: FakeMail, to: string) => {
  const message = mail.last(to);
  if (!message || !("url" in message.data)) throw new Error(`no link mailed to ${to}`);
  return message.data.url;
};

const follow = async (b: Browser, url: string) => b.fetch(url, { redirect: "manual" });

/** Signs up, verifies and logs in. Returns the logged-in browser. */
const verifiedLearner = async (w: World, email = newEmail(), password = GOOD) => {
  const b = browser(w.auth);
  expect(await b.client.signUp(email, password)).toEqual({ ok: true, data: null });
  await follow(b, linkIn(w.mail, email));
  expect((await b.client.signIn(email, password)).ok).toBe(true);
  return b;
};

const whoAmI = (w: World, b: Browser) =>
  w.auth.sessions.resolve(new Headers({ cookie: [...b.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }));

describe("sign-up and verification", () => {
  it("mails a verification link, refuses login until it is opened, then logs in as a Learner", async () => {
    const w = world();
    const b = browser(w.auth);
    const email = newEmail();
    expect(await b.client.signUp(email, GOOD)).toEqual({ ok: true, data: null });
    expect(w.mail.last(email)?.template).toBe("verify-email");
    expect(await b.client.signIn(email, GOOD)).toEqual(WRONG_LOGIN);

    await follow(b, linkIn(w.mail, email));
    expect(await b.client.signIn(email, GOOD)).toEqual({ ok: true, data: null });
    const learner = await w.auth.learners.findByEmail(email);
    expect(await whoAmI(w, b)).toEqual({ learnerId: learner!.id, role: "learner" });
  });

  it("ignores a role or deactivation sent with the sign-up", async () => {
    const w = world();
    const b = browser(w.auth);
    const email = newEmail();
    const response = await b.fetch(`${APP}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: GOOD, name: "", role: "supervisor", deactivated: true }),
    });
    expect(response.status).toBe(200);
    expect(await w.auth.learners.findByEmail(email)).toMatchObject({ role: "learner", deactivated: false });
  });

  it("sends no new link when an unverified Learner tries to log in", async () => {
    const w = world();
    const b = browser(w.auth);
    const email = newEmail();
    await b.client.signUp(email, GOOD);
    const mailed = w.mail.sent().length;
    expect(await b.client.signIn(email, GOOD)).toEqual(WRONG_LOGIN);
    expect(w.mail.sent()).toHaveLength(mailed);
  });

  it("answers an existing address exactly like a new one, mails 'already registered' and creates nothing", async () => {
    const w = world();
    const email = newEmail();
    await verifiedLearner(w, email);
    const before = await pg.db.select().from(t.learners).where(eq(t.learners.email, email));

    const again = await browser(w.auth).client.signUp(email, "another long passphrase");
    expect(again).toEqual({ ok: true, data: null });
    expect(w.mail.last(email)).toEqual({
      to: email,
      template: "already-registered",
      data: { resetUrl: `${APP}/reset-password` },
    });
    expect(await pg.db.select().from(t.learners).where(eq(t.learners.email, email))).toEqual(before);
  });

  it("refuses a verification link older than 24 hours", async () => {
    const w = world();
    const b = browser(w.auth);
    const email = newEmail();
    await b.client.signUp(email, GOOD);
    vi.useFakeTimers({ now: Date.now() + 24 * 3600_000 + 60_000, toFake: ["Date"] });
    try {
      await follow(b, linkIn(w.mail, email));
    } finally {
      vi.useRealTimers();
    }
    expect(await b.client.signIn(email, GOOD)).toEqual(WRONG_LOGIN);
  });

  it("resends the verification link on request", async () => {
    const w = world();
    const b = browser(w.auth);
    const email = newEmail();
    await b.client.signUp(email, GOOD);
    expect((await b.client.resendVerification(email)).ok).toBe(true);
    expect(w.mail.sent().filter((m) => m.to === email && m.template === "verify-email")).toHaveLength(2);
  });

  it("refuses sign-up while SIGNUP_OPEN is false, but existing Learners still log in", async () => {
    const open = world();
    const email = newEmail();
    await verifiedLearner(open, email);
    const closed = world({ signupOpen: false });
    const b = browser(closed.auth);
    expect(await b.client.signUp(newEmail(), GOOD)).toMatchObject({ ok: false, status: 400 });
    expect((await b.client.signIn(email, GOOD)).ok).toBe(true);
  });

  it("logs the sign-up and the login with the Learner ID and IP", async () => {
    const w = world();
    const email = newEmail();
    await verifiedLearner(w, email);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    expect(w.events).toEqual([
      { type: "signed-up", learnerId: id, ip: expect.stringMatching(/^10\./) },
      { type: "logged-in", learnerId: id, ip: expect.stringMatching(/^10\./) },
    ]);
  });
});

describe("password rules", () => {
  it.each([
    ["11 characters", "x".repeat(11), false],
    ["12 characters", "abcdefghijk1", true],
    ["128 characters", "y".repeat(128), true],
    ["129 characters", "z".repeat(129), false],
  ])("%s: accepted %s", async (_, password, accepted) => {
    const w = world();
    expect((await browser(w.auth).client.signUp(newEmail(), password)).ok).toBe(accepted);
  });

  it("refuses a breached password with a clear message, sending only 5 characters of its SHA-1", async () => {
    const w = world();
    const result = await browser(w.auth).client.signUp(newEmail(), BREACHED);
    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "This password appears in a known data breach. Choose a different one.",
    });
    expect(pwnedPrefixes).toEqual([createHash("sha1").update(BREACHED).digest("hex").slice(0, 5).toUpperCase()]);
  });

  it("stores the password as an argon2id hash", async () => {
    const w = world();
    const email = newEmail();
    await verifiedLearner(w, email);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    const [method] = await pg.db.select().from(t.loginMethods).where(eq(t.loginMethods.learnerId, id));
    expect(method!.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });
});

describe("login", () => {
  it("gives the same answer for an unknown email, a wrong password, an unverified and a deactivated account", async () => {
    const w = world();
    const verified = newEmail();
    await verifiedLearner(w, verified);
    const unverified = newEmail();
    await browser(w.auth).client.signUp(unverified, GOOD);
    const deactivated = newEmail();
    await verifiedLearner(w, deactivated);
    await w.auth.learners.setDeactivated((await w.auth.learners.findByEmail(deactivated))!.id, true);

    const attempts = [
      [newEmail(), GOOD],
      [verified, "not the right passphrase"],
      [unverified, GOOD],
      [deactivated, GOOD],
    ] as const;
    for (const [email, password] of attempts) {
      expect(await browser(w.auth).client.signIn(email, password)).toEqual(WRONG_LOGIN);
    }
    expect(w.events.filter((e) => e.type === "login-failed")).toHaveLength(4);
  });

  it("sets an httpOnly, Secure, SameSite=Lax, host-only cookie holding an opaque ID, valid for 30 days", async () => {
    const w = world();
    const email = newEmail();
    const b = browser(w.auth);
    await b.client.signUp(email, GOOD);
    await follow(b, linkIn(w.mail, email));
    const response = await b.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: GOOD }),
    });
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie.split(";")[0]!.split("=")[1]!.split(".")).not.toHaveLength(3);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    const { rows } = await pg.db.execute<{ days: number }>(
      sql`SELECT extract(epoch FROM expires_at - now()) / 86400 AS days FROM learner.sessions WHERE learner_id = ${id}`,
    );
    expect(Number(rows[0]!.days)).toBeCloseTo(30, 2);
  });

  it("refuses a state-changing request from another origin", async () => {
    const w = world();
    const b = await verifiedLearner(w);
    const response = await w.auth.authHandler(
      new Request(`${APP}/api/auth/sign-out`, {
        method: "POST",
        headers: { origin: "https://evil.test", cookie: [...b.cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
      }),
    );
    expect(response.status).toBe(403);
    expect(await whoAmI(w, b)).not.toBeNull();
  });
});

describe("rate limits", () => {
  it("blocks the 6th login from one IP within 15 minutes with 429 and Retry-After, and lets it through after", async () => {
    const w = world();
    const b = browser(w.auth, "192.0.2.1");
    for (let i = 0; i < 5; i++) expect(await b.client.signIn(newEmail(), GOOD)).toEqual(WRONG_LOGIN);
    const blocked = await b.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: newEmail(), password: GOOD }),
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
    w.clock.now = new Date(w.clock.now.getTime() + 15 * 60_000);
    expect(await b.client.signIn(newEmail(), GOOD)).toEqual(WRONG_LOGIN);
  });

  it("blocks the 6th login for one email within 15 minutes, whatever the IP", async () => {
    const w = world();
    const email = newEmail();
    for (let i = 0; i < 5; i++) await browser(w.auth).client.signIn(email, "wrong passphrase!!");
    expect(await browser(w.auth).client.signIn(email, GOOD)).toMatchObject({ ok: false, status: 429 });
  });

  it.each([
    ["sign-up", (c: LearnerClient) => c.signUp(newEmail(), GOOD)],
    ["password reset", (c: LearnerClient) => c.requestPasswordReset(newEmail())],
    ["resending verification", (c: LearnerClient) => c.resendVerification(newEmail())],
  ])("allows 3 %s requests per hour per IP", async (_, call) => {
    const w = world();
    const b = browser(w.auth);
    for (let i = 0; i < 3; i++) expect((await call(b.client)).ok).toBe(true);
    expect(await call(b.client)).toMatchObject({ ok: false, status: 429 });
  });
});

describe("password reset", () => {
  it("answers the same for an unknown address and mails a link only to a known one", async () => {
    const w = world();
    const email = newEmail();
    await verifiedLearner(w, email);
    const stranger = newEmail();
    const known = await browser(w.auth).client.requestPasswordReset(email);
    const unknown = await browser(w.auth).client.requestPasswordReset(stranger);
    expect(known).toEqual(unknown);
    expect(w.mail.last(email)?.template).toBe("reset-password");
    expect(w.mail.last(stranger)).toBeUndefined();
  });

  it("sets the new password once, ends every session, logs it, and stores the token only hashed", async () => {
    const w = world();
    const email = newEmail();
    const laptop = await verifiedLearner(w, email);
    const b = browser(w.auth);
    await b.client.requestPasswordReset(email);
    const redirect = await follow(b, linkIn(w.mail, email));
    const token = new URL(redirect.headers.get("location")!, APP).searchParams.get("token")!;
    expect(token).toBeTruthy();
    const stored = await pg.db.select({ identifier: t.verifications.identifier }).from(t.verifications);
    expect(stored.map((v) => v.identifier).join()).not.toContain(token);

    expect((await b.client.resetPassword(token, "my brand new passphrase")).ok).toBe(true);
    expect((await b.client.resetPassword(token, "and another passphrase")).ok).toBe(false);
    expect(await whoAmI(w, laptop)).toBeNull();
    expect(await browser(w.auth).client.signIn(email, GOOD)).toEqual(WRONG_LOGIN);
    expect((await browser(w.auth).client.signIn(email, "my brand new passphrase")).ok).toBe(true);
    expect(w.events.map((e) => e.type)).toContain("password-reset");
  });

  it("refuses a reset link older than 1 hour", async () => {
    const w = world();
    const email = newEmail();
    await verifiedLearner(w, email);
    const b = browser(w.auth);
    await b.client.requestPasswordReset(email);
    const redirect = await follow(b, linkIn(w.mail, email));
    const token = new URL(redirect.headers.get("location")!, APP).searchParams.get("token")!;
    await pg.db.execute(sql`UPDATE learner.verifications SET expires_at = now() - interval '1 second'`);
    expect((await b.client.resetPassword(token, "my brand new passphrase")).ok).toBe(false);
  });
});

describe("sessions", () => {
  it("lists the Learner's sessions and ends one on its own", async () => {
    const w = world();
    const email = newEmail();
    const laptop = await verifiedLearner(w, email);
    const phone = browser(w.auth);
    await phone.client.signIn(email, GOOD);
    const listed = await laptop.client.listSessions();
    expect(listed.ok && listed.data).toHaveLength(2);
    const phoneSession = listed.ok ? listed.data.find((s) => s.ipAddress !== null && !s.current) : undefined;
    expect(phoneSession).toBeDefined();
    expect((await laptop.client.endSession(phoneSession!.id)).ok).toBe(true);
    expect(await whoAmI(w, phone)).toBeNull();
    expect(await whoAmI(w, laptop)).not.toBeNull();
  });

  it("logs out the current session only", async () => {
    const w = world();
    const email = newEmail();
    const laptop = await verifiedLearner(w, email);
    const phone = browser(w.auth);
    await phone.client.signIn(email, GOOD);
    const phoneHeaders = new Headers({ cookie: [...phone.cookies].map(([k, v]) => `${k}=${v}`).join("; ") });
    expect((await phone.client.signOut()).ok).toBe(true);
    expect(await w.auth.sessions.resolve(phoneHeaders)).toBeNull();
    expect(await whoAmI(w, laptop)).not.toBeNull();
  });

  it("logs out everywhere", async () => {
    const w = world();
    const email = newEmail();
    const laptop = await verifiedLearner(w, email);
    const phone = browser(w.auth);
    await phone.client.signIn(email, GOOD);
    expect((await laptop.client.signOutEverywhere()).ok).toBe(true);
    expect(await whoAmI(w, phone)).toBeNull();
  });

  it("a password change keeps only the current session", async () => {
    const w = world();
    const email = newEmail();
    const laptop = await verifiedLearner(w, email);
    const phone = browser(w.auth);
    await phone.client.signIn(email, GOOD);
    expect((await laptop.client.changePassword(GOOD, "an even better passphrase")).ok).toBe(true);
    expect(await whoAmI(w, phone)).toBeNull();
    expect(await whoAmI(w, laptop)).not.toBeNull();
  });

  it("refuses a breached password on change", async () => {
    const w = world();
    const b = await verifiedLearner(w);
    expect(await b.client.changePassword(GOOD, BREACHED)).toMatchObject({ ok: false, status: 400 });
  });

  it("deactivating a Learner ends their sessions", async () => {
    const w = world();
    const email = newEmail();
    const b = await verifiedLearner(w, email);
    await w.auth.learners.setDeactivated((await w.auth.learners.findByEmail(email))!.id, true);
    expect(await whoAmI(w, b)).toBeNull();
  });

  it("resolves a Supervisor's role", async () => {
    const w = world();
    const email = newEmail();
    const b = await verifiedLearner(w, email);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    await w.auth.learners.setRole(id, "supervisor");
    expect(await whoAmI(w, b)).toEqual({ learnerId: id, role: "supervisor" });
  });

  it("resolves no session for a request without a cookie", async () => {
    expect(await world().auth.sessions.resolve(new Headers())).toBeNull();
  });
});

describe("changing the email", () => {
  it("keeps the old address until the new one is verified, then tells the old address", async () => {
    const w = world();
    const old = newEmail();
    const b = await verifiedLearner(w, old);
    const next = newEmail();
    expect((await b.client.changeEmail(next)).ok).toBe(true);
    expect(w.mail.last(next)?.template).toBe("verify-email");
    expect((await browser(w.auth).client.signIn(old, GOOD)).ok).toBe(true);

    await follow(b, linkIn(w.mail, next));
    expect((await browser(w.auth).client.signIn(next, GOOD)).ok).toBe(true);
    expect(await browser(w.auth).client.signIn(old, GOOD)).toEqual(WRONG_LOGIN);
    expect(w.mail.last(old)).toEqual({ to: old, template: "email-changed", data: { newEmail: next } });
  });
});

describe("deleting the account", () => {
  it("needs the password again", async () => {
    const w = world();
    const email = newEmail();
    const b = await verifiedLearner(w, email);
    expect((await b.fetch("/api/auth/delete-user", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(400);
    expect((await b.client.deleteAccount("not my passphrase")).ok).toBe(false);
    expect(await w.auth.learners.findByEmail(email)).not.toBeNull();
  });

  it("hard-deletes the account, its sessions, login methods and preferences, then mails and logs it", async () => {
    const w = world();
    const email = newEmail();
    const b = await verifiedLearner(w, email);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    await w.auth.learners.changePreferences(id, { examMode: true });

    expect((await b.client.deleteAccount(GOOD)).ok).toBe(true);
    expect(await w.auth.learners.findByEmail(email)).toBeNull();
    for (const table of [t.sessions, t.loginMethods, t.preferences]) {
      expect(await pg.db.select().from(table).where(eq(table.learnerId, id))).toEqual([]);
    }
    expect(w.mail.last(email)).toEqual({ to: email, template: "account-deleted", data: {} });
    expect(w.events).toContainEqual({ type: "deleted", learnerId: id, ip: expect.any(String) });
  });
});

describe("the client", () => {
  it("reads the current session", async () => {
    const w = world();
    const email = newEmail();
    const b = await verifiedLearner(w, email);
    const id = (await w.auth.learners.findByEmail(email))!.id;
    expect(await b.client.session()).toEqual({ ok: true, data: { learnerId: id, email, role: "learner" } });
    await b.client.signOut();
    expect(await b.client.session()).toEqual({ ok: true, data: null });
  });
});

describe("preferences over the client", () => {
  it("reads defaults, changes some, and keeps them", async () => {
    const w = world();
    const b = await verifiedLearner(w);
    expect(await b.client.preferences()).toMatchObject({ ok: true, data: { explanations: "english", furigana: "mixed" } });
    const changed = await b.client.changePreferences({ explanations: "both", examMode: true });
    expect(changed).toMatchObject({ ok: true, data: { explanations: "both", examMode: true, furigana: "mixed" } });
    expect(await b.client.preferences()).toEqual(changed);
  });

  it("refuses an invalid change, an unknown key and a change from another origin, and changes nothing", async () => {
    const w = world();
    const b = await verifiedLearner(w);
    expect(await b.client.changePreferences({ batchSize: 99 })).toMatchObject({ ok: false, status: 400 });
    expect(await b.client.changePreferences({ explanations: "neither" } as never)).toMatchObject({ ok: false, status: 400 });
    expect(await b.client.changePreferences({ bogus: 1 } as never)).toMatchObject({ ok: false, status: 400 });
    const cookie = [...b.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const foreign = await w.auth.authHandler(
      new Request(`${APP}/api/auth/preferences`, {
        method: "PUT",
        headers: { origin: "http://evil.test", cookie, "content-type": "application/json" },
        body: JSON.stringify({ examMode: true }),
      }),
    );
    expect(foreign.status).toBe(403);
    const bad = await b.fetch(`${APP}/api/auth/preferences`, { method: "PUT", body: "not json" });
    expect(bad.status).toBe(400);
    expect(await b.client.preferences()).toMatchObject({ data: { examMode: false, batchSize: 5 } });
  });

  it("needs a session, and answers only GET and PUT", async () => {
    const w = world();
    const anonymous = browser(w.auth);
    expect(await anonymous.client.preferences()).toMatchObject({ ok: false, status: 401 });
    expect(await anonymous.client.changePreferences({ examMode: true })).toMatchObject({ ok: false, status: 401 });
    const b = await verifiedLearner(w);
    expect((await b.fetch(`${APP}/api/auth/preferences`, { method: "DELETE" })).status).toBe(405);
  });
});
