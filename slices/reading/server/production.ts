import { randomUUID } from "node:crypto";
import { createAuthGuards } from "@mojibun/auth";
import { createContentGraph } from "@mojibun/content-graph";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import type { Mail } from "@mojibun/mail";
import { createPgBossJobs, type Jobs } from "@mojibun/jobs";
import { createProgress, createTexts } from "@mojibun/progress";
import { DEFAULT_PRACTICE } from "../practice/server/practice-api.ts";
import type { ReadingDeps } from "./reading-api.ts";

/** Resolving a session never sends mail. */
const noMail: Mail = {
  async send() {
    throw new Error("the reading slice does not send mail");
  },
};

/** Connects to the queue on the first Practice Text, so the API starts without it. */
const lazyJobs = (url: string): Pick<Jobs, "enqueue"> => {
  let connected: Promise<Jobs> | undefined;
  return { enqueue: async (contract, payload) => (await (connected ??= createPgBossJobs(url))).enqueue(contract, payload) };
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
      jobs: lazyJobs(url),
      newId: randomUUID,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      config: { ...DEFAULT_PRACTICE, dailyLimit: Number(env.PRACTICE_DAILY_LIMIT ?? DEFAULT_PRACTICE.dailyLimit) },
    },
  };
};
