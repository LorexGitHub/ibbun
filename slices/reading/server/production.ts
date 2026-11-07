import { createAuthGuards } from "@mojibun/auth";
import { createContentGraph } from "@mojibun/content-graph";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import type { Mail } from "@mojibun/mail";
import { createProgress, createTexts } from "@mojibun/progress";
import type { ReadingDeps } from "./api.ts";

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
  };
};
