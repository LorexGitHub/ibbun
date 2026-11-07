import { Hono } from "hono";
import type { AuthEnv, createAuthGuards } from "@mojibun/auth";
import type { ContentGraph, Word } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { Progress, Texts } from "@mojibun/progress";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { LookupRequest, type EpisodeLists, type LookupView, type TextView } from "../contract.ts";
import { episodeLists } from "./episodes.ts";
import { textView, type Reader } from "./text.ts";

export type ReadingDeps = {
  contentGraph: ContentGraph;
  progress: Progress;
  texts: Texts;
  learners: Learners;
  guards: ReturnType<typeof createAuthGuards>;
  now: () => Date;
};

const lookupView = ({ forms, readings, senses }: Word): LookupView => ({
  label: forms[0]?.text ?? readings[0]?.text ?? "",
  reading: readings[0]?.text ?? null,
  meanings: senses.flatMap((s) => s.glosses).slice(0, 4),
});

const notFound = { message: "no such text" };

/**
 * Reading (batch-text.md#reading-screen): the Learner's past Batch Texts as episodes per level, and Reading Passages.
 * Tapping a Word is logged as a `lookup` Review, which never feeds the scheduler.
 */
export const createReadingApi = ({ contentGraph, progress, texts, learners, guards, now }: ReadingDeps) => {
  const readerFor = async (learnerId: LearnerId, batch: readonly StudyItemId[]): Promise<Reader> => {
    const [{ furigana }, items] = await Promise.all([learners.preferences(learnerId), progress.items(learnerId)]);
    const byId = new Map(items.map((p) => [p.studyItemId, p.mastery]));
    return { furigana, mastery: (id) => byId.get(id) ?? "new", batch: new Set(batch) };
  };

  return new Hono<AuthEnv>()
    .use(guards.requireLearner())

    .get("/episodes", async (c) => {
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      const body: EpisodeLists = await episodeLists(await texts.batchTexts(learnerId), (id) => contentGraph.readingPassage(id));
      return c.json(body);
    })

    .get("/batch-texts/:id", async (c) => {
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      const text = (await texts.batchTexts(learnerId)).find((t) => t.id === c.req.param("id"));
      const passage = text && (await contentGraph.readingPassage(text.passageId));
      if (!text || !passage) return c.json(notFound, 404);
      const body: TextView = textView(passage, await readerFor(learnerId, text.studyItemIds), { level: text.level, number: text.episode });
      return c.json(body);
    })

    .get("/passages/:id", async (c) => {
      const passage = await contentGraph.readingPassage(c.req.param("id"));
      if (!passage) return c.json(notFound, 404);
      const body: TextView = textView(passage, await readerFor(LearnerId.parse(c.get("learner").learnerId), []), null);
      return c.json(body);
    })

    .post("/lookups", async (c) => {
      const body = LookupRequest.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ message: "not a lookup" }, 400);
      const page = await contentGraph.studyItem(body.data.wordId);
      if (page?.item.type !== "word") return c.json({ message: "no such Word" }, 404);
      await progress.record({ learnerId: LearnerId.parse(c.get("learner").learnerId), studyItemId: body.data.wordId, kind: "lookup", passed: false, at: now().toISOString() });
      return c.json(lookupView(page.item));
    });
};
