import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph, StudyItemPage, Word } from "@mojibun/content-graph";
import { grade, normalise, normaliseMeaning } from "@mojibun/content-graph/grade";
import type { Learners } from "@mojibun/learner";
import type { Progress } from "@mojibun/progress";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import { DueResponse, SubmitRequest, SubmitResponse, type Facet } from "../contract.ts";
import { explanationOf, facetsOf, isReviewable, pickExample, promptOf } from "./prompt.ts";

export type ReviewsDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  now: () => Date;
};

/** The most Reviews one request hands out. */
export const DUE_LIMIT = 50;

const normaliserOf = (facet: Facet) => (facet === "meaning" ? normaliseMeaning : normalise);

/** The Words a Kanji appears in, so the target Word sense's Japanese Explanation can be found. */
const wordsOf = async (graph: ContentGraph, page: StudyItemPage): Promise<Word[]> => {
  if (page.item.type !== "kanji") return [];
  const pages = await Promise.all(
    page.links.flatMap((l) => (l.kind === "contained_in_word" ? [graph.studyItem(StudyItemId.parse(l.word.id))] : [])),
  );
  return pages.flatMap((p) => (p?.item.type === "word" ? [p.item] : []));
};

export const createReviewsApi = ({ sessions, contentGraph, progress, learners, now }: ReviewsDeps) => {
  const { requireLearner } = createAuthGuards(sessions);

  const prompt = async (learnerId: LearnerId, id: StudyItemId) => {
    const page = await contentGraph.studyItem(id);
    if (!page || !isReviewable(page)) return null;
    const last = (await progress.log(learnerId, id)).findLast((r) => r.exampleId);
    const example = pickExample(page.examples, last?.exampleId);
    if (!example) return null;
    return promptOf(page, example, explanationOf(page.item, example, await wordsOf(contentGraph, page)));
  };

  return new Hono<AuthEnv>()
    .use(requireLearner())
    .get("/due", async (c) => {
      const { learnerId } = c.get("learner");
      const due = (await progress.due(learnerId, now())).slice(0, DUE_LIMIT);
      const prompts = await Promise.all(due.map((id) => prompt(learnerId, id)));
      const { convertRomaji, explanations } = await learners.preferences(learnerId);
      const body: DueResponse = { preferences: { convertRomaji, explanations }, reviews: prompts.flatMap((p) => (p ? [p] : [])) };
      return c.json(body);
    })
    .post("/answer", async (c) => {
      const { learnerId } = c.get("learner");
      const request = SubmitRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid answer" }, 400);
      const { studyItemId, exampleId, facets, hintsOpened, revealed, timeToAnswerMs } = request.data;

      const page = await contentGraph.studyItem(studyItemId);
      const example = page?.examples.find((e) => e.id === exampleId);
      if (!page || !isReviewable(page) || !example) return c.json({ message: "no such Review" }, 404);
      const expected = facetsOf(page, example);
      if (facets.length !== expected.length || !expected.every((e) => facets.some((f) => f.facet === e.facet))) {
        return c.json({ message: "answer every facet of the Review" }, 422);
      }

      // The API grades again: only what it graded is stored, so a forged pass never is.
      const graded = expected.map(({ facet, answerData }) => {
        const given = facets.find((f) => f.facet === facet)!;
        return { given, result: grade(answerData, given.input) };
      });
      if (!revealed && graded.some((g) => g.result.outcome === "retry")) {
        return c.json({ message: "that is not an answer yet" }, 422);
      }

      const results = graded.map(({ given, result }) => ({
        facet: given.facet,
        rawInput: given.input,
        normalisedInput: normaliserOf(given.facet)(given.input),
        outcome: !revealed && result.outcome === "pass" ? ("pass" as const) : ("fail" as const),
        ...(result.matchedAnswerId && { matchedAnswerId: result.matchedAnswerId }),
        ...(result.message && { message: result.message }),
      }));
      const passed = results.every((r) => r.outcome === "pass");
      await progress.record({
        learnerId,
        studyItemId,
        kind: "srs",
        passed,
        at: now().toISOString(),
        exampleId,
        facets: results.map(({ message: _, ...facet }) => facet),
        attempts: facets.flatMap((f) => f.attempts.map((input) => ({ facet: f.facet, input }))),
        hintsOpened,
        revealed,
        timeToAnswerMs,
      });
      const body: SubmitResponse = {
        passed,
        facets: results.map(({ facet, outcome, matchedAnswerId, message }) => ({ facet, outcome, matchedAnswerId, message })),
      };
      return c.json(body);
    });
};
