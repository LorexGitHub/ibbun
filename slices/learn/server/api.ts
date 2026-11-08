import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { LearningPath } from "@mojibun/learning-path";
import type { Progress } from "@mojibun/progress";
import type { LearnerId, StudyItemId } from "@mojibun/shared";
import { TrackChange, type Batch, type BatchItem, type State } from "../contract.ts";
import { ClipAnswer } from "../listening/contract.ts";
import { answerClip } from "../listening/server/answer.ts";
import { createClipTeacher } from "../listening/server/clip-teach.ts";
import { createNowIds } from "../learn-now/now.ts";
import { learnedToday, remainingOf } from "./learn-budget.ts";
import { createActions, type Refusal } from "./actions.ts";
import { createTeacher } from "./teach.ts";

export type LearnDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  learningPath: LearningPath;
  now: () => Date;
  /** [0, 1), for shuffling a comprehension question's options. */
  random?: () => number;
};

export const createLearnApi = ({ sessions, contentGraph, progress, learners, learningPath, now, random }: LearnDeps) => {
  const { requireLearner } = createAuthGuards(sessions);
  const teacher = createTeacher(contentGraph);
  const clips = createClipTeacher(contentGraph, random);

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

  const batchOf = async (learnerId: LearnerId, ids: StudyItemId[], remaining: number): Promise<Batch> => {
    const { convertRomaji, explanations, examMode, slowAudio } = await learners.preferences(learnerId);
    const teach = async (id: StudyItemId): Promise<BatchItem | null> => {
      const clip = await clips.teach(id, { examMode, slowAudio });
      return clip ? { clip } : teacher.teach(id);
    };
    const taught = await Promise.all(ids.map(teach));
    return { preferences: { convertRomaji, explanations }, remaining, items: taught.flatMap((t) => (t ? [t] : [])) };
  };

  const batch = async (learnerId: LearnerId): Promise<Batch> => {
    const current = await state(learnerId);
    const remaining = remainingOf(current);
    const size = Math.min(current.batchSize, remaining);
    return batchOf(learnerId, size > 0 ? await learningPath.next(learnerId, size) : [], remaining);
  };

  const nowIds = createNowIds({ teacher, learningPath });
  const batchNow = async (learnerId: LearnerId, raw: string): Promise<Batch | { refusal: Refusal }> => {
    const ids = await nowIds(learnerId, raw);
    return "refusal" in ids ? ids : batchOf(learnerId, ids, remainingOf(await state(learnerId)));
  };

  const { skip, complete } = createActions({ teacher, progress, now });

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
    .get("/batch", async (c) => c.json(await batch(c.get("learner").learnerId)))
    .get("/now/:id", async (c) => {
      const found = await batchNow(c.get("learner").learnerId, c.req.param("id"));
      return "refusal" in found ? c.json({ message: found.refusal.message }, found.refusal.status) : c.json(found);
    })
    .post("/skip", async (c) => {
      const done = await skip(c.get("learner").learnerId, await c.req.json().catch(() => null));
      return "refusal" in done ? c.json({ message: done.refusal.message }, done.refusal.status) : c.json(done);
    })
    .post("/clip/answer", async (c) => {
      const request = ClipAnswer.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid answer" }, 400);
      const { learnerId } = c.get("learner");
      const { examMode } = await learners.preferences(learnerId);
      const verdict = await answerClip({ clips, progress, examMode, now: now() }, learnerId, request.data);
      return verdict ? c.json(verdict) : c.json({ message: "no such quiz question" }, 404);
    })
    .post("/complete", async (c) => {
      const done = await complete(c.get("learner").learnerId, await c.req.json().catch(() => null));
      return "refusal" in done ? c.json({ message: done.refusal.message }, done.refusal.status) : c.json({ recorded: done.recorded });
    });
};
