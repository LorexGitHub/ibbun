import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph } from "@mojibun/content-graph";
import { BatchTextGenerate } from "@mojibun/content-graph/jobs";
import type { Jobs } from "@mojibun/jobs";
import type { Learners } from "@mojibun/learner";
import type { LearningPath } from "@mojibun/learning-path";
import type { Progress, Texts } from "@mojibun/progress";
import type { LearnerId, StudyItemId } from "@mojibun/shared";
import {
  BATCH_TEXT_LIMIT_24H,
  BatchTextRequest,
  LookupRequest,
  TrackChange,
  type Batch,
  type BatchItem,
  type BatchTextStatus,
  type State,
} from "../contract.ts";
import { ClipAnswer } from "../listening/contract.ts";
import { answerClip } from "../listening/server/answer.ts";
import { createClipTeacher } from "../listening/server/clip-teach.ts";
import { createNowIds } from "../learn-now/now.ts";
import { createActions, type Refusal } from "./actions.ts";
import { batchLevel, lookupView, sameItems, textView } from "./reading.ts";
import { createTeacher } from "./teach.ts";

export type LearnDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  learningPath: LearningPath;
  jobs: Pick<Jobs, "enqueue">;
  texts: Texts;
  now: () => Date;
  /** [0, 1), for shuffling a comprehension question's options. */
  random?: () => number;
};

export const createLearnApi = ({ sessions, contentGraph, progress, learners, learningPath, jobs, texts, now, random }: LearnDeps) => {
  const { requireLearner } = createAuthGuards(sessions);
  const teacher = createTeacher(contentGraph);
  const clips = createClipTeacher(contentGraph, random);

  const state = async (learnerId: LearnerId): Promise<State> => {
    const [tracks, { batchSize }] = await Promise.all([learningPath.activeTracks(learnerId), learners.preferences(learnerId)]);
    return { activeTracks: tracks.flatMap((t) => (t.type === "listening_clip" ? [] : [{ ...t, type: t.type }])), batchSize };
  };

  const batchOf = async (learnerId: LearnerId, ids: StudyItemId[]): Promise<Batch> => {
    const { convertRomaji, explanations, examMode, slowAudio } = await learners.preferences(learnerId);
    const teach = async (id: StudyItemId): Promise<BatchItem | null> => {
      const clip = await clips.teach(id, { examMode, slowAudio });
      return clip ? { clip } : teacher.teach(id);
    };
    const taught = await Promise.all(ids.map(teach));
    return { preferences: { convertRomaji, explanations }, items: taught.flatMap((t) => (t ? [t] : [])) };
  };

  /** The Learner's Batch Text for exactly this batch, once generation has written it. */
  const textOf = async (learnerId: LearnerId, ids: readonly string[]) =>
    (await texts.batchTexts(learnerId)).find((t) => sameItems(t.studyItemIds, ids));

  const batch = async (learnerId: LearnerId): Promise<Batch> => {
    const { batchSize } = await learners.preferences(learnerId);
    return batchOf(learnerId, await learningPath.next(learnerId, batchSize));
  };

  const nowIds = createNowIds({ teacher, learningPath });
  const batchNow = async (learnerId: LearnerId, raw: string): Promise<Batch | { refusal: Refusal }> => {
    const ids = await nowIds(learnerId, raw);
    return "refusal" in ids ? ids : batchOf(learnerId, ids);
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
    .post("/batch-text", async (c) => {
      const request = BatchTextRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid batch" }, 400);
      const { learnerId } = c.get("learner");
      const { studyItemIds } = request.data;
      const limited = (await texts.countLast24h(learnerId, "batch", now())) >= BATCH_TEXT_LIMIT_24H;
      if (limited || (await textOf(learnerId, studyItemIds))) return c.json({ enqueued: false });
      await jobs.enqueue(BatchTextGenerate, { learnerId, level: await batchLevel(contentGraph, studyItemIds), itemIds: studyItemIds });
      return c.json({ enqueued: true });
    })
    .get("/batch-text", async (c) => {
      const { learnerId } = c.get("learner");
      const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean);
      const text = ids.length > 0 ? await textOf(learnerId, ids) : undefined;
      const passage = text && (await contentGraph.readingPassage(text.passageId));
      if (!text || !passage) return c.json<BatchTextStatus>({ status: "preparing" });
      const [{ furigana }, items] = await Promise.all([learners.preferences(learnerId), progress.items(learnerId)]);
      const byId = new Map(items.map((p) => [p.studyItemId, p.mastery]));
      const reader = { furigana, mastery: (id: StudyItemId) => byId.get(id) ?? "new", batch: new Set(text.studyItemIds) };
      return c.json<BatchTextStatus>({ status: "ready", text: textView(passage, reader) });
    })
    .post("/lookups", async (c) => {
      const request = LookupRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a lookup" }, 400);
      const page = await contentGraph.studyItem(request.data.wordId);
      if (page?.item.type !== "word") return c.json({ message: "no such Word" }, 404);
      const { learnerId } = c.get("learner");
      await progress.record({ learnerId, studyItemId: request.data.wordId, kind: "lookup", passed: false, at: now().toISOString() });
      return c.json(lookupView(page.item));
    })
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
