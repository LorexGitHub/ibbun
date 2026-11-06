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

/** The dashboard's routes, mounted by the api shell at `/api/dashboard`. */
export const createDashboardApi = ({ sessions, progress, contentGraph, now = () => new Date() }: DashboardDeps) => {
  const { requireLearner } = createAuthGuards(sessions);
  const today = new Hono<AuthEnv>().get("/today", requireLearner(), async (c) =>
    c.json(await buildToday({ progress, contentGraph, learnerId: c.get("learner").learnerId, now: now() })),
  );
  return new Hono().route("/", today);
};
