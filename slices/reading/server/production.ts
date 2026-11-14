import { randomUUID } from "node:crypto";
import { createAuthGuards } from "@ibbun/auth";
import { createContentGraph } from "@ibbun/content-graph";
import { createDb } from "@ibbun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import type { Mail } from "@ibbun/mail";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import { createProgress, createTexts } from "@ibbun/progress";
import { DEFAULT_PRACTICE } from "../practice/server/practice-api.ts";
import type { ReadingDeps } from "./reading-api.ts";

/** Resolving a session never sends mail. */
const noMail: Mail = {
  async send() {
    throw new Error("the reading slice does not send mail");
  },
};

/** The real core modules, wired from the environment (`DATABASE_URL`, `AUTH_SECRET`, `APP_URL`). */
export const productionDeps = (env: Record<string, string | undefined>): ReadingDeps => {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  const { sessions, learners } = createLearnerAuth({ db, mail: noMail, config: learnerConfigFromEnv(env) });
  return {
    contentGraph: createContentGraph(db),
    progress: createProgress(db),
    texts: createTexts(db),
    learners,
    guards: createAuthGuards(sessions),
    now: () => new Date(),
    practice: {
      jobs: createSqsJobsFromEnv(env),
      newId: randomUUID,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      config: DEFAULT_PRACTICE,
    },
  };
};
