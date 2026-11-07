import { createContentGraph } from "@mojibun/content-graph";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createSmtpMail } from "@mojibun/mail";
import { createProgress } from "@mojibun/progress";
import type { CramDeps } from "./api.ts";

type Env = Record<string, string | undefined>;

/**
 * Cram's real dependencies: core's Postgres-backed interfaces, and the session resolver from `learner`.
 * Built on the first request, so a missing setting makes Cram answer 503 instead of stopping the API.
 */
export const dependenciesFromEnv = async (env: Env): Promise<CramDeps> => {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!env.SMTP_URL) throw new Error("SMTP_URL is not set");
  const db = createDb(url);
  const mail = createSmtpMail({ url: env.SMTP_URL, from: "mojibun <noreply@mojibun.test>" });
  const { sessions } = createLearnerAuth({ db, mail, config: learnerConfigFromEnv(env) });
  return { contentGraph: createContentGraph(db), progress: createProgress(db), sessions, now: () => new Date() };
};
