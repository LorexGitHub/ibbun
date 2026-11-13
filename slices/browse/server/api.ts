import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@ibbun/auth";
import type { ContentGraph } from "@ibbun/content-graph";
import type { LearningPath } from "@ibbun/learning-path";
import type { Progress } from "@ibbun/progress";
import { StudyItemId } from "@ibbun/shared";
import { BrowseType, JlptLevel, type ItemResponse, type LevelList, type Redirect, type SearchResults } from "../contract.ts";
import { itemPageOf, summaryOf } from "./page.ts";

const TYPES = BrowseType.options;

export type BrowseDeps = {
  contentGraph: ContentGraph;
  learningPath: LearningPath;
  progress: Progress;
  sessions: SessionResolver;
};

/** The browse routes, mounted by the api shell at `/api/browse`. */
export const createBrowseApi = ({ contentGraph, learningPath, progress, sessions }: BrowseDeps) => {
  const { requireLearner } = createAuthGuards(sessions);

  return new Hono<AuthEnv>()
    .get("/levels/:level", requireLearner(), async (c) => {
      const level = JlptLevel.safeParse(c.req.param("level"));
      if (!level.success) return c.json({ message: "unknown JLPT Level" }, 404);
      const [met, ...lists] = await Promise.all([progress.items(c.get("learner").learnerId), ...TYPES.map((type) => contentGraph.levelList(level.data, type))]);
      const mastery = new Map(met.map((p) => [p.studyItemId, p.mastery]));
      const body: LevelList = { level: level.data, items: lists.flat().map((item) => ({ ...summaryOf(item), mastery: mastery.get(item.id) || "new" })) };
      return c.json(body);
    })
    .get("/search", requireLearner(), async (c) => {
      const query = c.req.query("q")?.trim() || "";
      const body: SearchResults = { query, items: (await contentGraph.search(query)).map(summaryOf) };
      return c.json(body);
    })
    .get("/items/:id", requireLearner(), async (c) => {
      const id = StudyItemId.safeParse(c.req.param("id"));
      if (!id.success) return c.json({ message: "no such Study Item" }, 404);
      const { learnerId } = c.get("learner");

      const found = await contentGraph.studyItem(id.data);
      if (!found) {
        const redirectTo = await contentGraph.successorOf(id.data);
        if (!redirectTo) return c.json({ message: "no such Study Item" }, 404);
        const body: Redirect = { redirectTo };
        return c.json(body);
      }
      const [locked, introduced] = await Promise.all([learningPath.isLocked(learnerId, id.data), progress.introduced(learnerId)]);
      const page = itemPageOf(found, { locked, introduced: introduced.includes(id.data) });
      if (!page) return c.json({ message: "no such Study Item" }, 404);
      const body: ItemResponse = page;
      return c.json(body);
    });
};
