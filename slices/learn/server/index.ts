import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearners } from "@mojibun/learner";
import { createLearningPath } from "@mojibun/learning-path";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createLearnApi } from "./api.ts";

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
        now: () => new Date(),
      }),
    ),
  };
};
