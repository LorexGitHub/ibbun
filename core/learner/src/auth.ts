import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { z } from "zod";
import type { SessionResolver } from "@mojibun/auth";
import type { Db } from "@mojibun/db";
import type { Mail } from "@mojibun/mail";
import { LearnerId } from "@mojibun/shared";
import * as t from "../db/learner-tables.ts";
import type { LearnerConfig } from "./config.ts";
import { consoleAuthLog, type AuthLog } from "./events.ts";
import { createLearners, type Learners } from "./learners.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { answerFailedLogin, guardRequest, ipOf, oldEmailOfChange } from "./policy.ts";

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
const BREACHED = "This password appears in a known data breach. Choose a different one.";
const id = (raw: string) => LearnerId.parse(raw);

type Deps = { db: Db; mail: Mail; config: LearnerConfig; log: AuthLog; now: () => Date; learners: Learners };

/** Where Better Auth keeps its rows: the learner schema, under mojibun's names. */
const storage = (db: Db) =>
  ({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { learners: t.learners, loginMethods: t.loginMethods, sessions: t.sessions, verifications: t.verifications },
  }),
  account: { modelName: "loginMethods", fields: { userId: "learnerId" } },
  session: { modelName: "sessions", fields: { userId: "learnerId" }, expiresIn: 30 * DAY, updateAge: DAY },
    verification: { modelName: "verifications", storeIdentifier: "hashed" },
  }) satisfies BetterAuthOptions;

/** Accounts: who they are, how they verify, reset and delete, and which mail each step sends. */
const accounts = ({ mail, config, log }: Deps) =>
  ({
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
  }) satisfies BetterAuthOptions;

/** Hooks on rows: log sign-ups and logins, tell the old address about a new one, keep deactivated Learners out. */
const rowHooks = ({ mail, log, learners }: Deps): BetterAuthOptions["databaseHooks"] => ({
  user: {
    create: { after: async (user, ctx) => log({ type: "signed-up", learnerId: id(user.id), ip: ipOf(ctx?.request?.headers) }) },
    update: {
      after: async (user, ctx) => {
        const old = oldEmailOfChange(ctx, user.email);
        if (old) await mail.send({ to: old, template: "email-changed", data: { newEmail: user.email } });
      },
    },
  },
  session: {
    create: {
      before: async (session) => ((await learners.get(id(session.userId)))?.deactivated ? false : undefined),
      after: async (session) => log({ type: "logged-in", learnerId: id(session.userId), ip: session.ipAddress ?? null }),
    },
  },
});

export const createLearnerAuth = ({ db, mail, config, log = consoleAuthLog, now = () => new Date() }: LearnerAuthOptions): LearnerAuth => {
  const learners = createLearners(db, log);
  const deps: Deps = { db, mail, config, log, now, learners };

  const auth = betterAuth({
    appName: "mojibun",
    baseURL: `${config.appUrl}/api/auth`,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.appUrl],
    ...storage(db),
    ...accounts(deps),
    databaseHooks: rowHooks(deps),
    hooks: { before: createAuthMiddleware((ctx) => guardRequest(ctx, { db, now })) },
    plugins: [haveIBeenPwned({ customPasswordCompromisedMessage: BREACHED })],
    // Rate limits live in policy.ts, so Better Auth's own are off.
    rateLimit: { enabled: false },
    advanced: {
      // Better Auth skips the origin check under test runners unless told otherwise.
      disableOriginCheck: false,
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      database: { generateId: "uuid" },
    },
  });

  return {
    authHandler: async (request) => answerFailedLogin(request, await auth.handler(request), log),
    sessions: {
      async resolve(headers) {
        const found = await auth.api.getSession({ headers });
        return found ? { learnerId: id(found.user.id), role: Role.parse(found.user.role) } : null;
      },
    },
    learners,
  };
};
