import { createContentGraph } from "@mojibun/content-graph";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createSmtpMail } from "@mojibun/mail";
import { createProgress } from "@mojibun/progress";
import { createDashboardApi, type DashboardDeps } from "./api.ts";

/** The real dependencies: Postgres from `DATABASE_URL`, and the Learner sessions the account slice's cookies carry. */
export const productionDeps = (env: Record<string, string | undefined>): DashboardDeps => {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const db = createDb(env.DATABASE_URL);
  // Mail is never sent from here; Better Auth just needs a transport to start.
  const mail = createSmtpMail({ url: env.SMTP_URL ?? "smtp://localhost:1025", from: "mojibun <noreply@mojibun.test>" });
  const { sessions } = createLearnerAuth({ db, mail, config: learnerConfigFromEnv(env) });
  return { sessions, progress: createProgress(db), contentGraph: createContentGraph(db) };
};

let deps: DashboardDeps | undefined;

export const api = createDashboardApi(() => (deps ??= productionDeps(process.env)));
