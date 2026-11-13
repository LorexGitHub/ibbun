import { Hono } from "hono";
import { createContentGraph } from "@ibbun/content-graph";
import { createLearningPath } from "@ibbun/learning-path";
import { createProgress } from "@ibbun/progress";
import type { ServerContext, ServerPart } from "@ibbun/slice";
import { createBrowseApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const contentGraph = createContentGraph(db);
  const progress = createProgress(db);
  const browse = createBrowseApi({ contentGraph, progress, sessions, learningPath: createLearningPath(db, { contentGraph, progress }) });
  return { api: new Hono().route("/", browse) };
};
