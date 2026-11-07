import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearningPath } from "@mojibun/learning-path";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createBrowseApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const contentGraph = createContentGraph(db);
  const progress = createProgress(db);
  const browse = createBrowseApi({ contentGraph, progress, sessions, learningPath: createLearningPath(db, { contentGraph, progress }) });
  return { api: new Hono().route("/", browse) };
};
