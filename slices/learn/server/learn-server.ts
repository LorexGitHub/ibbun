import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearners } from "@mojibun/learner";
import { createLearningPath } from "@mojibun/learning-path";
import { createPgBossJobs } from "@mojibun/jobs";
import { createProgress, createTexts } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { lazyEnqueue } from "./enqueue.ts";
import { createLearnApi } from "./learn-api.ts";

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
        jobs: lazyEnqueue(process.env.DATABASE_URL, createPgBossJobs),
        texts: createTexts(db),
        now: () => new Date(),
      }),
    ),
  };
};
