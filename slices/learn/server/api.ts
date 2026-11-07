import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph, StudyItemPage, Word } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { LearningPath } from "@mojibun/learning-path";
import type { Progress } from "@mojibun/progress";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import { CompleteRequest, SkipRequest, TrackChange, type Batch, type State } from "../contract.ts";
import { learnedToday } from "./budget.ts";
import { lessonOf } from "./lesson.ts";
import { explanationOf, facetsOf, isTaught, promptOf } from "./prompt.ts";
import { coversFacets, regrade } from "./regrade.ts";

export type LearnDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  learningPath: LearningPath;
  now: () => Date;
};

/** The Words a Kanji appears in, so the target Word sense's Japanese Explanation can be found. */
const wordsOf = async (graph: ContentGraph, page: StudyItemPage): Promise<Word[]> => {
  if (page.item.type !== "kanji") return [];
  const pages = await Promise.all(
    page.links.flatMap((l) => (l.kind === "contained_in_word" ? [graph.studyItem(StudyItemId.parse(l.word.id))] : [])),
  );
  return pages.flatMap((p) => (p?.item.type === "word" ? [p.item] : []));
};

export const createLearnApi = ({ sessions, contentGraph, progress, learners, learningPath, now }: LearnDeps) => {
  const { requireLearner } = createAuthGuards(sessions);

  const state = async (learnerId: LearnerId): Promise<State> => {
    const [tracks, { batchSize, dailyBudget }, log] = await Promise.all([
      learningPath.activeTracks(learnerId),
      learners.preferences(learnerId),
      progress.log(learnerId),
    ]);
    return {
      activeTracks: tracks.flatMap((t) => (t.type === "listening_clip" ? [] : [{ ...t, type: t.type }])),
      batchSize,
      dailyBudget,
      learnedToday: learnedToday(log, now()),
    };
  };

  /** The lesson and the quiz question of a Study Item, or null while it has no approved Example. */
  const teach = async (id: StudyItemId) => {
    const page = await contentGraph.studyItem(id);
    const example = page?.examples[0];
    if (!page || !isTaught(page) || !example) return null;
    const explanation = explanationOf(page.item, example, await wordsOf(contentGraph, page));
    return { lesson: lessonOf(page, example, explanation), prompt: promptOf(page, example, explanation) };
  };

  /** The approved Example of a taught Study Item, or null when either is not there. */
  const locate = async (studyItemId: StudyItemId, exampleId: string) => {
    const page = await contentGraph.studyItem(studyItemId);
    const example = page?.examples.find((e) => e.id === exampleId);
    return page && isTaught(page) && example ? { page, example } : null;
  };

  return new Hono<AuthEnv>()
    .use(requireLearner())
    .get("/state", async (c) => c.json(await state(c.get("learner").learnerId)))
    .put("/tracks", async (c) => {
      const { learnerId } = c.get("learner");
      const change = TrackChange.safeParse(await c.req.json().catch(() => null));
      if (!change.success) return c.json({ message: "not a valid list of Tracks" }, 400);
      const kept = (await learningPath.activeTracks(learnerId)).filter((t) => t.type === "listening_clip");
      await learningPath.setActiveTracks(learnerId, [...kept, ...change.data.tracks]);
      return c.json(await state(learnerId));
    })
    .get("/batch", async (c) => {
      const { learnerId } = c.get("learner");
      const { activeTracks: _, ...budget } = await state(learnerId);
      const remaining = Math.max(0, budget.dailyBudget - budget.learnedToday);
      const size = Math.min(budget.batchSize, remaining);
      const ids = size > 0 ? await learningPath.next(learnerId, size) : [];
      const taught = await Promise.all(ids.map(teach));
      const { convertRomaji, explanations } = await learners.preferences(learnerId);
      const body: Batch = { preferences: { convertRomaji, explanations }, remaining, items: taught.flatMap((t) => (t ? [t] : [])) };
      return c.json(body);
    })
    .post("/skip", async (c) => {
      const { learnerId } = c.get("learner");
      const request = SkipRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid Study Item" }, 400);
      const page = await contentGraph.studyItem(request.data.studyItemId);
      if (!page || !isTaught(page)) return c.json({ message: "no such Study Item" }, 404);
      await progress.record({ learnerId, studyItemId: request.data.studyItemId, kind: "manual", passed: true, at: now().toISOString(), source: "learn-skip" });
      return c.json({ studyItemId: request.data.studyItemId });
    })
    .post("/complete", async (c) => {
      const { learnerId } = c.get("learner");
      const request = CompleteRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid quiz" }, 400);

      const graded = [];
      for (const answer of request.data.answers) {
        const found = await locate(answer.studyItemId, answer.exampleId);
        if (!found) return c.json({ message: "no such quiz question" }, 404);
        const expected = facetsOf(found.page, found.example);
        if (!coversFacets(expected, answer.facets)) return c.json({ message: "answer every facet of the question" }, 422);
        const results = regrade(expected, answer.facets);
        if (!results?.every((r) => r.outcome === "pass")) return c.json({ message: "the quiz is not fully correct yet" }, 422);
        graded.push({ answer, results });
      }

      for (const { answer, results } of graded) {
        await progress.record({
          learnerId,
          studyItemId: answer.studyItemId,
          kind: "learn",
          passed: true,
          at: now().toISOString(),
          exampleId: answer.exampleId,
          facets: results,
          attempts: answer.facets.flatMap((f) => f.attempts.map((input) => ({ facet: f.facet, input }))),
          timeToAnswerMs: answer.timeToAnswerMs,
        });
      }
      return c.json({ recorded: graded.length });
    });
};
