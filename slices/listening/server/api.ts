import { Hono } from "hono";
import type { z } from "zod";
import type { AuthEnv, createAuthGuards } from "@mojibun/auth";
import { normalise, type ContentGraph, type Example } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { Progress } from "@mojibun/progress";
import { JlptLevel, LearnerId, StudyItemId } from "@mojibun/shared";
import { AnswerRequest, type AnswerResponse, type ClipList } from "../contract.ts";
import { gradingOf, nextExample, playable, transcriptOf, viewOf, type Playable } from "./clip.ts";

type AnswerBody = z.output<typeof AnswerRequest>;

export type ListeningDeps = {
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  guards: ReturnType<typeof createAuthGuards>;
  now: () => Date;
  /** [0, 1), for shuffling a comprehension question's options. */
  random: () => number;
};

const notFound = { message: "no such clip" };

/**
 * Free Listening practice (listening.md#wiring): pick a level, hear its clips, answer. Every graded answer
 * is logged as a `cram` Review, so it never moves the schedule. The server grades, so a forged pass is never stored.
 */
export const createListeningApi = ({ contentGraph, progress, learners, guards, now, random }: ListeningDeps) => {
  type Graded = { facet: string; outcome: "pass" | "fail" } & Omit<AnswerBody, "exampleId">;
  const record = async (learnerId: LearnerId, clip: Playable, example: Example, g: Graded) => {
    const { examMode } = await learners.preferences(learnerId);
    await progress.record({
      learnerId,
      studyItemId: StudyItemId.parse(clip.clipId),
      kind: "cram",
      passed: g.outcome === "pass",
      at: now().toISOString(),
      exampleId: example.id,
      facets: [{ facet: g.facet, rawInput: g.input, normalisedInput: normalise(g.input), outcome: g.outcome }],
      attempts: g.attempts.map((input) => ({ facet: g.facet, input })),
      revealed: g.revealed,
      timeToAnswerMs: g.timeToAnswerMs,
      // The clip plays once in Exam Mode: there is no replay button and no slow speed.
      listening: { replays: examMode ? 0 : g.replays, slow: !examMode && g.slow, examMode },
    });
  };

  const clipOf = async (id: string): Promise<Playable | null> => playable(await contentGraph.studyItem(StudyItemId.parse(id)));

  return new Hono<AuthEnv>()
    .use(guards.requireLearner())

    .get("/clips", async (c) => {
      const level = JlptLevel.safeParse(c.req.query("level"));
      if (!level.success) return c.json({ message: "level must be N5 to N1" }, 400);
      const body: ClipList = { level: level.data, clipIds: await contentGraph.listeningClips(level.data) };
      return c.json(body);
    })

    .get("/clips/:id", async (c) => {
      const clip = await clipOf(c.req.param("id"));
      if (!clip) return c.json(notFound, 404);
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      const [prefs, answered] = await Promise.all([learners.preferences(learnerId), progress.log(learnerId, StudyItemId.parse(clip.clipId))]);
      return c.json(viewOf(clip, nextExample(clip, answered.length), prefs, random));
    })

    .post("/clips/:id/answer", async (c) => {
      const body = AnswerRequest.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ message: "not an answer" }, 400);
      const clip = await clipOf(c.req.param("id"));
      const example = clip?.examples.find((e) => e.id === body.data.exampleId);
      if (!clip || !example) return c.json(notFound, 404);

      const { facet, run, correctChoice } = gradingOf(example);
      const { input, revealed } = body.data;
      const outcome = revealed ? "fail" : run(input).outcome;
      if (outcome === "retry") return c.json({ outcome } satisfies AnswerResponse);

      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      await record(learnerId, clip, example, { facet, outcome, ...body.data });
      const response: AnswerResponse = { outcome, transcript: transcriptOf(clip), ...(correctChoice && { correctChoice }) };
      return c.json(response);
    });
};
