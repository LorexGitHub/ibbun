import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@ibbun/auth";
import type { ContentGraph } from "@ibbun/content-graph";
import type { Progress } from "@ibbun/progress";
import { JlptLevel } from "@ibbun/shared";
import { buildLevel } from "./level.ts";
import { buildToday, type BatchSize } from "./today.ts";

export type DashboardDeps = {
  sessions: SessionResolver;
  progress: Progress;
  contentGraph: ContentGraph;
  batchSize: BatchSize;
  now?: () => Date;
};

/** The dashboard's routes, mounted by the api shell at `/api/dashboard`. */
export const createDashboardApi = ({ sessions, progress, contentGraph, batchSize, now = () => new Date() }: DashboardDeps) => {
  const { requireLearner } = createAuthGuards(sessions);
  const routes = new Hono<AuthEnv>()
    .get("/today", requireLearner(), async (c) =>
      c.json(await buildToday({ progress, contentGraph, batchSize, learnerId: c.get("learner").learnerId, now: now() })),
    )
    .get("/levels/:level", requireLearner(), async (c) => {
      // The page's address says "n5"; the level's name is "N5"
      const level = JlptLevel.safeParse(c.req.param("level").toUpperCase());
      if (!level.success) return c.json({ message: "unknown JLPT Level" }, 404);
      return c.json(await buildLevel({ progress, contentGraph, learnerId: c.get("learner").learnerId, now: now(), level: level.data }));
    });
  return new Hono().route("/", routes);
};
