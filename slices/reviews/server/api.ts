import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph, StudyItemPage, Word } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { Progress } from "@mojibun/progress";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import { DueResponse, SubmitRequest } from "../contract.ts";
import { explanationOf, facetsOf, isReviewable, pickExample, promptOf } from "./prompt.ts";
import { createClipReviewsApi } from "../listening/server/clip-reviews-api.ts";
import { coversFacets, detailOf, regrade, responseOf, storedFacets } from "./regrade.ts";

export type ReviewsDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  now: () => Date;
  /** [0, 1), for shuffling a listening question's options. */
  random?: () => number;
};

/** The most Reviews one request hands out. */
export const DUE_LIMIT = 50;

/** The Words a Kanji appears in, so the target Word sense's Japanese Explanation can be found. */
const wordsOf = async (graph: ContentGraph, page: StudyItemPage): Promise<Word[]> => {
  if (page.item.type !== "kanji") return [];
  const pages = await Promise.all(
    page.links.flatMap((l) => (l.kind === "contained_in_word" ? [graph.studyItem(StudyItemId.parse(l.word.id))] : [])),
  );
  return pages.flatMap((p) => (p?.item.type === "word" ? [p.item] : []));
};

export const createReviewsApi = ({ sessions, contentGraph, progress, learners, now, random = Math.random }: ReviewsDeps) => {
  const guards = createAuthGuards(sessions);
  const { requireLearner } = guards;

  const prompt = async (learnerId: LearnerId, id: StudyItemId) => {
    const page = await contentGraph.studyItem(id);
    if (!page || !isReviewable(page)) return null;
    const last = (await progress.log(learnerId, id)).findLast((r) => r.exampleId);
    const example = pickExample(page.examples, last?.exampleId);
    if (!example) return null;
    return promptOf(page, example, explanationOf(page.item, example, await wordsOf(contentGraph, page)));
  };

  /** The approved Example of a reviewable Study Item, or null when either is not there. */
  const locate = async (studyItemId: StudyItemId, exampleId: string) => {
    const page = await contentGraph.studyItem(studyItemId);
    const example = page?.examples.find((e) => e.id === exampleId);
    return page && isReviewable(page) && example ? { page, example } : null;
  };

  return new Hono<AuthEnv>()
    .use(requireLearner())
    .route("/listening", createClipReviewsApi({ contentGraph, progress, learners, guards, now, random }))
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
      const { studyItemId, exampleId, facets, revealed } = request.data;

      const found = await locate(studyItemId, exampleId);
      if (!found) return c.json({ message: "no such Review" }, 404);
      const expected = facetsOf(found.page, found.example);
      if (!coversFacets(expected, facets)) return c.json({ message: "answer every facet of the Review" }, 422);

      const results = regrade(expected, facets, revealed);
      if (!results) return c.json({ message: "that is not an answer yet" }, 422);
      const body = responseOf(results);
      await progress.record({
        learnerId,
        studyItemId,
        kind: "srs",
        passed: body.passed,
        at: now().toISOString(),
        exampleId,
        facets: storedFacets(results),
        ...detailOf(request.data),
      });
      return c.json(body);
    });
};
