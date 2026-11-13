import { createAuthGuards } from "@ibbun/auth";
import { createContentGraph } from "@ibbun/content-graph";
import { createDb } from "@ibbun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import type { Mail } from "@ibbun/mail";
import { createPgBossJobs, type Jobs } from "@ibbun/jobs";
import { createProgress, createTexts } from "@ibbun/progress";
import type { ListeningDeps } from "./listening-api.ts";

/** Resolving a session never sends mail. */
const noMail: Mail = {
  async send() {
    throw new Error("the listening slice does not send mail");
  },
};

/** Opens the job queue on the first Practice Text, so the API starts without it. */
const lazyJobs = (url: string): Pick<Jobs, "enqueue"> & Jobs => {
  let queue: Promise<Jobs> | undefined;
  const connected = () => (queue ??= createPgBossJobs(url).catch((error) => ((queue = undefined), Promise.reject(error))));
  const unused = () => Promise.reject(new Error("the listening slice only enqueues jobs"));
  return { enqueue: async (contract, payload) => (await connected()).enqueue(contract, payload), schedule: unused, work: unused, stop: unused };
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
    jobs: lazyJobs(url),
    practiceLimit: Number(env.PRACTICE_TEXT_LIMIT ?? DEFAULT_PRACTICE_LIMIT),
    learners,
    guards: createAuthGuards(sessions),
    now: () => new Date(),
    random: Math.random,
  };
};
