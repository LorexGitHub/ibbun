// The account rules Better Auth does not enforce on its own (accounts.md#security-standards).
import { APIError } from "better-auth/api";
import type { DbOrTx } from "@mojibun/db";
import type { AuthLog } from "./events.ts";
import { normalizeEmail } from "./learners.ts";
import { hitRateLimit, type RateLimitRule } from "./rate-limit.ts";

const LOGIN = "/sign-in/email";
const LOGIN_FAILED = "email or password is wrong";

/** Login: 5 tries per 15 min per IP and per email. Sign-up, reset and resending verification: 3 per hour per IP. */
const PER_IP: Record<string, RateLimitRule> = {
  [LOGIN]: { windowSeconds: 15 * 60, max: 5 },
  "/sign-up/email": { windowSeconds: 3600, max: 3 },
  "/request-password-reset": { windowSeconds: 3600, max: 3 },
  "/send-verification-email": { windowSeconds: 3600, max: 3 },
};
const PER_EMAIL: Record<string, RateLimitRule> = { [LOGIN]: PER_IP[LOGIN]! };

/** The client IP the proxy in front of the api reports, when the call came in over HTTP. */
export const ipOf = (call: { request?: { headers: Headers } } | null | undefined): string | null =>
  call?.request?.headers.get("x-forwarded-for")?.split(",")[0]!.trim() || null;

/** What a guard sees of a request. */
type Request = { path: string; body?: Record<string, unknown>; request?: { headers: Headers } };

const limit = async (db: DbOrTx, now: Date, key: string, rule: RateLimitRule | undefined) => {
  const blocked = rule && (await hitRateLimit(db, key, rule, now));
  if (blocked) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "too many tries; wait and try again" }, {
      "Retry-After": String(blocked.retryAfter),
    });
  }
};

/** Counts the request against its limits. Throws 429 with Retry-After once one is used up. */
const rateLimit = async (call: Request, db: DbOrTx, now: Date) => {
  const { path, body } = call;
  const ip = ipOf(call);
  if (ip) await limit(db, now, `ip:${ip}:${path}`, PER_IP[path]);
  if (typeof body?.email === "string") await limit(db, now, `email:${normalizeEmail(body.email)}:${path}`, PER_EMAIL[path]);
};

/**
 * Runs before every auth endpoint. Applies the rate limits, asks for the password before an
 * account is deleted, and makes every password change end the Learner's other sessions.
 */
export const guardRequest = async (ctx: Request, { db, now }: { db: DbOrTx; now: () => Date }) => {
  await rateLimit(ctx, db, now());
  if (ctx.path === "/delete-user" && !ctx.body?.password) {
    throw new APIError("BAD_REQUEST", { message: "enter your password to delete the account" });
  }
  if (ctx.path === "/change-password") return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
};

/**
 * Every failed login gets the same answer, whatever was wrong: unknown email, wrong
 * password, unverified or deactivated account. A rate-limited login keeps its 429.
 */
export const answerFailedLogin = (request: Request["request"] & { url: string }, response: Response, log: AuthLog) => {
  if (!new URL(request.url).pathname.endsWith(LOGIN) || response.ok || response.status === 429) return response;
  log({ type: "login-failed", ip: ipOf({ request }) });
  return Response.json({ code: "LOGIN_FAILED", message: LOGIN_FAILED }, { status: 401 });
};

/** The `email` claim of a JWT whose signature Better Auth has already checked. */
const emailClaim = (jwt: string): unknown => JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")).email;

/**
 * The address a Learner just moved away from, when this update is the change-email link
 * being opened: only that link moves an address, and its token names the old one.
 */
export const oldEmailOfChange = (
  ctx: { path?: string; query?: Record<string, unknown> } | null | undefined,
  newEmail: string,
): string | undefined => {
  const token = ctx?.path === "/verify-email" ? ctx.query?.token : undefined;
  const old = typeof token === "string" ? emailClaim(token) : undefined;
  return typeof old === "string" && old !== newEmail ? old : undefined;
};
