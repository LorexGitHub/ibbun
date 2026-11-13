import type { Role } from "@ibbun/auth";
import type { DbOrTx } from "@ibbun/db";
import { addLearner, normalizeEmail, type Learners } from "./learners.ts";
import { hashPassword } from "./password.ts";

export type SeedEnv = {
  NODE_ENV?: string;
  SEED_LEARNER_PASSWORD?: string;
  SEED_SUPERVISOR_PASSWORD?: string;
  /** The account the seed makes a Supervisor, in every environment. */
  SUPERVISOR_EMAIL?: string;
};

const DEV_ACCOUNTS: { email: string; role: Role; password: keyof SeedEnv }[] = [
  { email: "learner@ibbun.test", role: "learner", password: "SEED_LEARNER_PASSWORD" },
  { email: "supervisor@ibbun.test", role: "supervisor", password: "SEED_SUPERVISOR_PASSWORD" },
];

const seedDevAccounts = async (db: DbOrTx, learners: Learners, env: SeedEnv) => {
  const passwords = DEV_ACCOUNTS.map((account) => {
    const password = env[account.password];
    if (!password) throw new Error(`${account.password} is not set`);
    return password;
  });
  for (const [i, account] of DEV_ACCOUNTS.entries()) {
    if (await learners.findByEmail(account.email, db)) continue;
    await addLearner(db, { ...account, emailVerified: true, passwordHash: await hashPassword(passwords[i]!) });
  }
};

/**
 * Creates `learner@ibbun.test` and `supervisor@ibbun.test` outside production, and makes
 * SUPERVISOR_EMAIL a Supervisor. Safe to run again. Returns what it did, one line each.
 */
export const seedAccounts = async (db: DbOrTx, learners: Learners, env: SeedEnv): Promise<string[]> => {
  const report: string[] = [];
  if (env.NODE_ENV === "production") report.push("dev accounts: refused in production");
  else {
    await seedDevAccounts(db, learners, env);
    report.push(`dev accounts: ${DEV_ACCOUNTS.map((a) => a.email).join(", ")}`);
  }
  if (env.SUPERVISOR_EMAIL) {
    const email = normalizeEmail(env.SUPERVISOR_EMAIL);
    const owner = await learners.findByEmail(email, db);
    if (!owner) report.push(`${email}: no account yet; sign up, then run the seed again`);
    else {
      if (owner.role !== "supervisor") await learners.setRole(owner.id, "supervisor", db);
      report.push(`${email}: supervisor`);
    }
  }
  return report;
};

/** `pnpm --filter @ibbun/learner grant-supervisor <email>`. Logged like every role change. */
export const grantSupervisor = async (learners: Learners, email: string): Promise<void> => {
  const learner = await learners.findByEmail(email);
  if (!learner) throw new Error(`no account for ${normalizeEmail(email)}`);
  await learners.setRole(learner.id, "supervisor");
};
