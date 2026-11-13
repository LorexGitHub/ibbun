import { Hono } from "hono";
import { createAuthGuards } from "@ibbun/auth";
import { createContentGraph } from "@ibbun/content-graph";
import { createAnswerFlags } from "@ibbun/content-graph/flags";
import { createLearners } from "@ibbun/learner";
import { createProgress } from "@ibbun/progress";
import type { ServerContext, ServerPart } from "@ibbun/slice";
import { createFlagsApi } from "../flags/api.ts";
import { withListening } from "../listening/server/with-listening.ts";
import { createReviewsApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const learners = createLearners(db);
  const contentGraph = createContentGraph(db);
  const progress = createProgress(db);
  const now = () => new Date();
  const reviews = createReviewsApi({ sessions, learners, contentGraph, progress, now });
  const listening = { contentGraph, progress, learners, guards: createAuthGuards(sessions), now, random: Math.random };
  return {
    api: new Hono()
      .route("/", withListening(reviews, listening))
      .route("/", createFlagsApi({ sessions, progress, answerFlags: createAnswerFlags(db) })),
  };
};
