import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph } from "@mojibun/content-graph";
import type { Progress } from "@mojibun/progress";
import { buildToday } from "./today.ts";

export type DashboardDeps = {
  sessions: SessionResolver;
  progress: Progress;
  contentGraph: ContentGraph;
  now?: () => Date;
};

/**
 * The dashboard's routes, mounted by the api shell at `/api/dashboard`. `deps` is read per request,
 * so the real wiring can wait until the first request and a missing setting fails that request, not the API's start.
 */
export const createDashboardApi = (deps: () => DashboardDeps) => {
  const { requireLearner } = createAuthGuards({ resolve: (headers) => deps().sessions.resolve(headers) });
  const today = new Hono<AuthEnv>().get("/today", requireLearner(), async (c) => {
    const { progress, contentGraph, now = () => new Date() } = deps();
    return c.json(await buildToday({ progress, contentGraph, learnerId: c.get("learner").learnerId, now: now() }));
  });
  return new Hono().route("/", today);
};
