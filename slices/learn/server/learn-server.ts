import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearners } from "@mojibun/learner";
import { createLearningPath } from "@mojibun/learning-path";
import { createPgBossJobs, type Jobs } from "@mojibun/jobs";
import { createProgress, createTexts } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createLearnApi } from "./learn-api.ts";

/** The queue connects on the first enqueue, so the worker, which loads every slice, never needs it for Learn. */
const lazyJobs = (url: string | undefined): Jobs => {
  let queue: Promise<Jobs> | undefined;
  const open = () => {
    if (!url) throw new Error("DATABASE_URL is not set");
    return (queue ??= createPgBossJobs(url));
  };
  return {
    enqueue: async (contract, payload) => (await open()).enqueue(contract, payload),
    schedule: async (contract, cron, payload) => (await open()).schedule(contract, cron, payload),
    work: async (handlers) => (await open()).work(handlers),
    stop: async () => (queue ? (await queue).stop() : undefined),
  };
};

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const contentGraph = createContentGraph(db);
  const progress = createProgress(db);
  return {
    api: new Hono().route(
      "/",
      createLearnApi({
        sessions,
        learners: createLearners(db),
        contentGraph,
        progress,
        learningPath: createLearningPath(db, { contentGraph, progress }),
        jobs: lazyJobs(process.env.DATABASE_URL),
        texts: createTexts(db),
        now: () => new Date(),
      }),
    ),
  };
};
