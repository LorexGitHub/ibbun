import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { BrowsableType, ContentGraph } from "@mojibun/content-graph";
import type { Progress } from "@mojibun/progress";
import { JlptLevel, type LearnerId } from "@mojibun/shared";
import { PlacementSubmission, type PlacementItem, type PlacementList, type PlacementResult } from "../contract.ts";

const TYPES: BrowsableType[] = ["kanji", "word", "grammar_point"];

/** Runs `work` in one transaction (the real one) or straight through (tests). */
export type Transact = <T>(work: (tx?: Parameters<Progress["record"]>[1]) => Promise<T>) => Promise<T>;

export type PlacementDeps = {
  graph: ContentGraph;
  progress: Progress;
  sessions: SessionResolver;
  transact: Transact;
  now?: () => Date;
};

export const createPlacementApi = ({ graph, progress, sessions, transact, now = () => new Date() }: PlacementDeps) => {
  const { requireLearner } = createAuthGuards(sessions);

  const levelItems = async (level: JlptLevel, learnerId: LearnerId): Promise<PlacementItem[]> => {
    const [lists, known] = await Promise.all([
      Promise.all(TYPES.map((type) => graph.levelList(level, type))),
      progress.known(learnerId),
    ]);
    const knownIds = new Set(known);
    return lists.flat().map((s) => ({
      id: s.id,
      type: s.type,
      label: s.label,
      reading: s.reading,
      meaning: s.meaning,
      known: knownIds.has(s.id),
    }));
  };

  return new Hono<AuthEnv>()
    .get("/:level", requireLearner(), async (c) => {
      const level = JlptLevel.safeParse(c.req.param("level"));
      if (!level.success) return c.json({ message: "unknown JLPT Level" }, 404);
      const body: PlacementList = { level: level.data, items: await levelItems(level.data, c.get("learner").learnerId) };
      return c.json(body);
    })
    .post("/:level", requireLearner(), async (c) => {
      const level = JlptLevel.safeParse(c.req.param("level"));
      if (!level.success) return c.json({ message: "unknown JLPT Level" }, 404);
      const submission = PlacementSubmission.safeParse(await c.req.json().catch(() => null));
      if (!submission.success) return c.json({ message: "tick at least one Study Item" }, 400);

      const { learnerId } = c.get("learner");
      const items = new Map((await levelItems(level.data, learnerId)).map((i) => [i.id, i]));
      const ticked = [...new Set(submission.data.studyItemIds)];
      if (ticked.some((id) => !items.has(id))) return c.json({ message: "a ticked item is not on this level" }, 400);

      const fresh = ticked.filter((id) => !items.get(id)!.known);
      const at = now().toISOString();
      await transact(async (tx) => {
        for (const studyItemId of fresh) {
          await progress.record({ learnerId, studyItemId, kind: "manual", passed: true, at, source: "placement" }, tx);
        }
      });
      const body: PlacementResult = { recorded: fresh.length };
      return c.json(body);
    });
};
