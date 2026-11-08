import { Hono } from "hono";
import { createAuthGuards } from "@mojibun/auth";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearners } from "@mojibun/learner";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { withListening } from "../listening/server/with-listening.ts";
import { createReviewsApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const learners = createLearners(db);
  const contentGraph = createContentGraph(db);
  const progress = createProgress(db);
  const now = () => new Date();
  const reviews = createReviewsApi({ sessions, learners, contentGraph, progress, now });
  const listening = { contentGraph, progress, learners, guards: createAuthGuards(sessions), now, random: Math.random };
  return { api: new Hono().route("/", withListening(reviews, listening)) };
};
