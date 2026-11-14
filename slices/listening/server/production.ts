import { createAuthGuards } from "@ibbun/auth";
import { createContentGraph } from "@ibbun/content-graph";
import { createDb } from "@ibbun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import type { Mail } from "@ibbun/mail";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import { createProgress, createTexts } from "@ibbun/progress";
import type { ListeningDeps } from "./listening-api.ts";

/** Resolving a session never sends mail. */
const noMail: Mail = {
  async send() {
    throw new Error("the listening slice does not send mail");
  },
};

/** Practice Texts per Learner in a rolling 24 h unless `PRACTICE_TEXT_LIMIT` says otherwise (accounts.md). */
const DEFAULT_PRACTICE_LIMIT = 5;

/** The real core modules, wired from the environment (`DATABASE_URL`, `AUTH_SECRET`, `APP_URL`). */
export const productionDeps = (env: Record<string, string | undefined>): ListeningDeps => {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  const { sessions, learners } = createLearnerAuth({ db, mail: noMail, config: learnerConfigFromEnv(env) });
  return {
    contentGraph: createContentGraph(db),
    progress: createProgress(db),
    texts: createTexts(db),
    jobs: createSqsJobsFromEnv(env),
    practiceLimit: Number(env.PRACTICE_TEXT_LIMIT ?? DEFAULT_PRACTICE_LIMIT),
    learners,
    guards: createAuthGuards(sessions),
    now: () => new Date(),
    random: Math.random,
  };
};
