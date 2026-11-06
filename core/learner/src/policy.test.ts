import { describe, expect, it } from "vitest";
import type { AuthEvent } from "./events.ts";
import { answerFailedLogin, guardRequest, ipOf, oldEmailOfChange } from "./policy.ts";

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

describe("oldEmailOfChange", () => {
  const change = jwt({ email: "old@x.test", updateTo: "new@x.test" });

  it("names the old address when the change-email link moves an address", () => {
    expect(oldEmailOfChange({ path: "/verify-email", query: { token: change } }, "new@x.test")).toBe("old@x.test");
  });

  it.each([
    ["any other endpoint", { path: "/update-user", query: { token: change } }, "new@x.test"],
    ["a request with no context", null, "new@x.test"],
    ["a link without a token", { path: "/verify-email", query: {} }, "new@x.test"],
    ["a link without a query", { path: "/verify-email" }, "new@x.test"],
    ["a sign-up verification, which keeps the address", { path: "/verify-email", query: { token: jwt({ email: "a@x.test" }) } }, "a@x.test"],
    ["a token with no email claim", { path: "/verify-email", query: { token: jwt({}) } }, "a@x.test"],
  ])("names nothing for %s", (_, ctx, newEmail) => {
    expect(oldEmailOfChange(ctx, newEmail)).toBeUndefined();
  });
});

describe("answerFailedLogin", () => {
  const login = { url: "http://m.test/api/auth/sign-in/email", headers: new Headers({ "x-forwarded-for": "10.1.2.3" }) };

  it("turns any failed login into one 401 answer and logs it with the IP", async () => {
    const events: AuthEvent[] = [];
    const answer = answerFailedLogin(login, Response.json({ code: "EMAIL_NOT_VERIFIED" }, { status: 403 }), (e) => void events.push(e));
    expect(answer.status).toBe(401);
    expect(await answer.json()).toEqual({ code: "LOGIN_FAILED", message: "email or password is wrong" });
    expect(events).toEqual([{ type: "login-failed", ip: "10.1.2.3" }]);
  });

  it.each([
    ["a successful login", login, 200],
    ["a rate-limited login", login, 429],
    ["a failure on another endpoint", { ...login, url: "http://m.test/api/auth/sign-up/email" }, 400],
  ])("passes %s through unchanged", (_, request, status) => {
    const response = new Response(null, { status });
    expect(answerFailedLogin(request, response, () => expect.unreachable())).toBe(response);
  });
});

describe("ipOf", () => {
  const over = (headers: Headers) => ({ request: { headers } });

  it("takes the client, the first address the proxy reports", () => {
    expect(ipOf(over(new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" })))).toBe("203.0.113.9");
  });

  it("answers null without the header", () => {
    expect(ipOf(over(new Headers()))).toBeNull();
    expect(ipOf(over(new Headers({ "x-forwarded-for": "" })))).toBeNull();
  });

  it("answers null for a call that did not come in over HTTP", () => {
    expect(ipOf(undefined)).toBeNull();
    expect(ipOf(null)).toBeNull();
    expect(ipOf({})).toBeNull();
  });
});

describe("guardRequest", () => {
  // Without an IP or an email no limit applies, so the database is never reached.
  const deps = { db: undefined as never, now: () => new Date() };

  it.each([
    ["no body", { path: "/delete-user" }],
    ["no password", { path: "/delete-user", body: {} }],
  ])("asks for the password to delete an account when the request has %s", async (_, ctx) => {
    await expect(guardRequest(ctx, deps)).rejects.toMatchObject({ statusCode: 400 });
  });
});
