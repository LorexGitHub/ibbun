import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { z } from "zod";
import type { SessionResolver } from "@mojibun/auth";
import type { Db } from "@mojibun/db";
import type { Mail } from "@mojibun/mail";
import { LearnerId } from "@mojibun/shared";
import * as t from "../db/schema.ts";
import type { LearnerConfig } from "./config.ts";
import { consoleAuthLog, type AuthLog } from "./events.ts";
import { createLearners, normalizeEmail, type Learners } from "./learners.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { hitRateLimit, type RateLimitRule } from "./rate-limit.ts";

export type LearnerAuthOptions = {
  db: Db;
  mail: Mail;
  config: LearnerConfig;
  log?: AuthLog;
  /** The clock for rate limits. */
  now?: () => Date;
};

export type LearnerAuth = {
  /** Handles every request under `/api/auth/*`. The api shell mounts it there. */
  authHandler: (request: Request) => Promise<Response>;
  sessions: SessionResolver;
  learners: Learners;
};

const Role = z.enum(["learner", "supervisor"]);
const DAY = 24 * 3600;
const LOGIN_FAILED = "email or password is wrong";
const BREACHED = "This password appears in a known data breach. Choose a different one.";

// accounts.md#security-standards. Login is limited per IP and per email; the rest per IP.
const PER_IP: Record<string, RateLimitRule> = {
  "/sign-in/email": { windowSeconds: 15 * 60, max: 5 },
  "/sign-up/email": { windowSeconds: 3600, max: 3 },
  "/request-password-reset": { windowSeconds: 3600, max: 3 },
  "/send-verification-email": { windowSeconds: 3600, max: 3 },
};
const PER_EMAIL: Record<string, RateLimitRule> = { "/sign-in/email": PER_IP["/sign-in/email"]! };

/** The client IP the proxy in front of the api reports. */
const ipOf = (headers: Headers | undefined) => headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

/** The payload of a JWT whose signature Better Auth has already checked. */
const jwtPayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8") || "{}");

export const createLearnerAuth = ({ db, mail, config, log = consoleAuthLog, now = () => new Date() }: LearnerAuthOptions): LearnerAuth => {
  const learners = createLearners(db, log);
  const id = (raw: string) => LearnerId.parse(raw);

  const limit = async (key: string, rule: RateLimitRule | undefined) => {
    if (!rule) return;
    const blocked = await hitRateLimit(db, key, rule, now());
    if (blocked) {
      throw new APIError("TOO_MANY_REQUESTS", { message: "too many tries; wait and try again" }, {
        "Retry-After": String(blocked.retryAfter),
      });
    }
  };

  const auth = betterAuth({
    appName: "mojibun",
    baseURL: `${config.appUrl}/api/auth`,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.appUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { learners: t.learners, loginMethods: t.loginMethods, sessions: t.sessions, verifications: t.verifications },
    }),
    user: {
      modelName: "learners",
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "learner" },
        deactivated: { type: "boolean", input: false, defaultValue: false },
      },
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        afterDelete: async (user, request) => {
          await mail.send({ to: user.email, template: "account-deleted", data: {} });
          log({ type: "deleted", learnerId: id(user.id), ip: ipOf(request?.headers) });
        },
      },
    },
    account: { modelName: "loginMethods", fields: { userId: "learnerId" } },
    session: {
      modelName: "sessions",
      fields: { userId: "learnerId" },
      expiresIn: 30 * DAY,
      updateAge: DAY,
    },
    verification: { modelName: "verifications", storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.signupOpen,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => mail.send({ to: user.email, template: "reset-password", data: { url } }),
      onExistingUserSignUp: ({ user }) =>
        mail.send({ to: user.email, template: "already-registered", data: { resetUrl: `${config.appUrl}/reset-password` } }),
      onPasswordReset: async ({ user }, request) =>
        log({ type: "password-reset", learnerId: id(user.id), ip: ipOf(request?.headers) }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: ({ user, url }) => mail.send({ to: user.email, template: "verify-email", data: { url } }),
    },
    rateLimit: { enabled: false },
    advanced: {
      // Better Auth skips the origin check under test runners unless told otherwise.
      disableOriginCheck: false,
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
      database: { generateId: "uuid" },
    },
    plugins: [haveIBeenPwned({ customPasswordCompromisedMessage: BREACHED })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await limit(`ip:${ipOf(ctx.request?.headers)}:${ctx.path}`, ipOf(ctx.request?.headers) ? PER_IP[ctx.path] : undefined);
        const email = typeof ctx.body?.email === "string" ? normalizeEmail(ctx.body.email) : null;
        if (email) await limit(`email:${email}:${ctx.path}`, PER_EMAIL[ctx.path]);
        if (ctx.path === "/delete-user" && !ctx.body?.password) {
          throw new APIError("BAD_REQUEST", { message: "enter your password to delete the account" });
        }
        if (ctx.path === "/change-password") return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => log({ type: "signed-up", learnerId: id(user.id), ip: ipOf(ctx?.request?.headers) }),
        },
        update: {
          after: async (user, ctx) => {
            // Only the change-email link moves an address; its token names the old one.
            const token = ctx?.path === "/verify-email" ? ctx.query?.token : undefined;
            const old = typeof token === "string" ? jwtPayload(token).email : undefined;
            if (typeof old === "string" && old !== user.email) {
              await mail.send({ to: old, template: "email-changed", data: { newEmail: user.email } });
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const learner = await learners.get(id(session.userId));
            return learner?.deactivated ? false : undefined;
          },
          after: async (session) =>
            log({ type: "logged-in", learnerId: id(session.userId), ip: session.ipAddress ?? null }),
        },
      },
    },
  });

  const authHandler = async (request: Request): Promise<Response> => {
    const response = await auth.handler(request);
    const isLogin = new URL(request.url).pathname.endsWith("/sign-in/email");
    if (!isLogin || response.ok || response.status === 429) return response;
    // Every failed login looks the same: never say which part was wrong.
    log({ type: "login-failed", ip: ipOf(request.headers) });
    return Response.json({ code: "LOGIN_FAILED", message: LOGIN_FAILED }, { status: 401 });
  };

  const sessions: SessionResolver = {
    async resolve(headers) {
      const found = await auth.api.getSession({ headers });
      return found ? { learnerId: id(found.user.id), role: Role.parse(found.user.role) } : null;
    },
  };

  return { authHandler, sessions, learners };
};
