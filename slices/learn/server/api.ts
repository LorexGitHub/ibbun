import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { LearningPath } from "@mojibun/learning-path";
import type { Progress } from "@mojibun/progress";
import type { LearnerId } from "@mojibun/shared";
import { CompleteRequest, SkipRequest, TrackChange, type Batch, type State } from "../contract.ts";
import { learnedToday } from "./budget.ts";
import { gradeQuiz, recordQuiz } from "./complete.ts";
import { createTeacher } from "./teach.ts";

export type LearnDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  learningPath: LearningPath;
  now: () => Date;
};

export const createLearnApi = ({ sessions, contentGraph, progress, learners, learningPath, now }: LearnDeps) => {
  const { requireLearner } = createAuthGuards(sessions);
  const teacher = createTeacher(contentGraph);

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

  const batch = async (learnerId: LearnerId): Promise<Batch> => {
    const { batchSize, dailyBudget, learnedToday: learned } = await state(learnerId);
    const remaining = Math.max(0, dailyBudget - learned);
    const size = Math.min(batchSize, remaining);
    const ids = size > 0 ? await learningPath.next(learnerId, size) : [];
    const taught = await Promise.all(ids.map(teacher.teach));
    const { convertRomaji, explanations } = await learners.preferences(learnerId);
    return { preferences: { convertRomaji, explanations }, remaining, items: taught.flatMap((t) => (t ? [t] : [])) };
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
    .get("/batch", async (c) => c.json(await batch(c.get("learner").learnerId)))
    .post("/skip", async (c) => {
      const request = SkipRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid Study Item" }, 400);
      const { studyItemId } = request.data;
      if (!(await teacher.isTaught(studyItemId))) return c.json({ message: "no such Study Item" }, 404);
      const { learnerId } = c.get("learner");
      await progress.record({ learnerId, studyItemId, kind: "manual", passed: true, at: now().toISOString(), source: "learn-skip" });
      return c.json({ studyItemId });
    })
    .post("/complete", async (c) => {
      const request = CompleteRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid quiz" }, 400);
      const checked = await gradeQuiz(teacher.locate, request.data.answers);
      if ("refusal" in checked) return c.json({ message: checked.refusal.message }, checked.refusal.status);
      await recordQuiz(progress, c.get("learner").learnerId, checked.graded, now());
      return c.json({ recorded: checked.graded.length });
    });
};
