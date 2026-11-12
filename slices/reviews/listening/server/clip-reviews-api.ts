import { Hono } from "hono";
import type { z } from "zod";
import type { AuthEnv, createAuthGuards } from "@mojibun/auth";
import { normalise, type ContentGraph, type Example } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { Progress } from "@mojibun/progress";
import type { LearnerId, StudyItemId } from "@mojibun/shared";
import { ClipAnswerRequest, type ClipAnswerResponse, type ClipDueResponse } from "../contract.ts";
import { gradingOf, nextExample, playable, reviewOf, transcriptOf, type Playable } from "./clip-playable.ts";
import { dueAt } from "../../server/api.ts";
import { diffDictation } from "./dictation-diff.ts";

export type ClipReviewsDeps = {
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  guards: ReturnType<typeof createAuthGuards>;
  now: () => Date;
  /** [0, 1), for shuffling a comprehension question's options. */
  random: () => number;
};

/** The most clips one request hands out. */
export const CLIP_DUE_LIMIT = 50;

const notFound = { message: "no such Review" };

type Graded = { facet: "dictation" | "comprehension"; outcome: "pass" | "fail"; input: string; correctChoice?: string };

/** What the Learner sees after answering: the transcript, the right option, and the diff of a failed dictation. */
const responseOf = (clip: Playable, example: Example, { facet, outcome, input, correctChoice }: Graded): ClipAnswerResponse => {
  const feedback = facet === "dictation" && outcome === "fail" ? diffDictation(example.sentence.tokens, input) : null;
  return { outcome, transcript: transcriptOf(clip), ...(correctChoice && { correctChoice }), ...(feedback && { diff: feedback.tokens, extra: feedback.extra }) };
};

/**
 * Scheduled Listening Clip Reviews (listening.md#wiring). The server grades, so a forged pass is never
 * stored. The Review is logged as `srs`: it moves the schedule like any other Study Item.
 */
export const createClipReviewsApi = ({ contentGraph, progress, learners, guards, now, random }: ClipReviewsDeps) => {
  const lastExampleId = async (learnerId: LearnerId, id: StudyItemId) =>
    (await progress.log(learnerId, id)).findLast((r) => r.kind === "srs" && r.exampleId)?.exampleId;

  /** Logs the Review. The clip plays once in Exam Mode: there is no replay button and no slow speed. */
  const record = async (learnerId: LearnerId, answer: z.output<typeof ClipAnswerRequest>, graded: { facet: string; outcome: "pass" | "fail" }) => {
    const { examMode } = await learners.preferences(learnerId);
    await progress.record({
      learnerId,
      studyItemId: answer.clipId,
      kind: "srs",
      passed: graded.outcome === "pass",
      at: now().toISOString(),
      exampleId: answer.exampleId,
      facets: [{ facet: graded.facet, rawInput: answer.input, normalisedInput: normalise(answer.input), outcome: graded.outcome }],
      attempts: answer.attempts.map((input) => ({ facet: graded.facet, input })),
      revealed: answer.revealed,
      timeToAnswerMs: answer.timeToAnswerMs,
      listening: { replays: examMode ? 0 : answer.replays, slow: !examMode && answer.slow, examMode },
    });
  };

  return new Hono<AuthEnv>()
    .use(guards.requireLearner())

    .get("/due", async (c) => {
      const { learnerId } = c.get("learner");
      const [all, prefs] = await Promise.all([progress.due(learnerId, now()), learners.preferences(learnerId)]);
      const due = await dueAt(contentGraph, all, c.req.query("level"));
      const clips = (await Promise.all(due.slice(0, CLIP_DUE_LIMIT).map(async (id) => {
        const clip = playable(await contentGraph.studyItem(id));
        return clip && reviewOf(clip, nextExample(clip, await lastExampleId(learnerId, id)), prefs, random);
      }))).flatMap((review) => (review ? [review] : []));
      const body: ClipDueResponse = { clips };
      return c.json(body);
    })

    .post("/answer", async (c) => {
      const { learnerId } = c.get("learner");
      const request = ClipAnswerRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid answer" }, 400);
      const { clipId, exampleId, input, revealed } = request.data;

      const clip = playable(await contentGraph.studyItem(clipId));
      const example = clip?.examples.find((e) => e.id === exampleId);
      if (!clip || !example) return c.json(notFound, 404);

      const { facet, run, correctChoice } = gradingOf(example);
      const outcome = revealed ? "fail" : run(input).outcome;
      if (outcome === "retry") return c.json({ outcome } satisfies ClipAnswerResponse);

      await record(learnerId, request.data, { facet, outcome });
      return c.json(responseOf(clip, example, { facet, outcome, input, correctChoice }));
    });
};
