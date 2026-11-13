import { randomUUID } from "node:crypto";
import type { ContentGraph } from "@ibbun/content-graph";
import type { DbOrTx } from "@ibbun/db";
import type { Progress } from "@ibbun/progress";
import type { JlptLevel, LearnerId, StudyItemId } from "@ibbun/shared";
import { DEFAULT_CONFIG, type LearningPathConfig } from "./config.ts";
import { STRATEGIES, type Plan } from "./strategy.ts";
import { DEFAULT_ACTIVE_TRACKS, normaliseTracks, type Track } from "./track.ts";

/** The `learning-path` core interface (docs/learning-path.md#interface). */
export type LearningPath = {
  /** Gives the Learner a random seed and the default active Tracks. Call at sign-up; a second call changes nothing. */
  start(learnerId: LearnerId, tx?: DbOrTx): Promise<void>;
  activeTracks(learnerId: LearnerId, tx?: DbOrTx): Promise<Track[]>;
  /** Replaces the active Tracks. Progress in a Track is kept when it is made inactive. */
  setActiveTracks(learnerId: LearnerId, tracks: Track[], tx?: DbOrTx): Promise<Track[]>;
  /** The next `n` items for a Learn batch, each after its pulled-in dependencies. */
  next(learnerId: LearnerId, n: number, tx?: DbOrTx): Promise<StudyItemId[]>;
  /** The next `n` items of one level: its Tracks of every type the Learner has active at any level. Active Tracks stay as they are. */
  nextAt(learnerId: LearnerId, level: JlptLevel, n: number, tx?: DbOrTx): Promise<StudyItemId[]>;
  /** For Learn now: the item after its pulled-in dependencies. */
  forItem(learnerId: LearnerId, studyItemId: StudyItemId, tx?: DbOrTx): Promise<StudyItemId[]>;
  /** For the Browse badge. */
  isLocked(learnerId: LearnerId, studyItemId: StudyItemId, tx?: DbOrTx): Promise<boolean>;
};

export type LearnerPath = { seed: string; activeTracks: Track[] };

/** Where the seed and active Tracks live. The real one is Postgres; the fake is a Map. */
export type LearnerPathStore = {
  get(learnerId: LearnerId, tx?: DbOrTx): Promise<LearnerPath | null>;
  /** Does nothing when the Learner already has a row. */
  insert(learnerId: LearnerId, path: LearnerPath, tx?: DbOrTx): Promise<void>;
  setActiveTracks(learnerId: LearnerId, tracks: Track[], tx?: DbOrTx): Promise<void>;
};

export type LearningPathDeps = {
  store: LearnerPathStore;
  contentGraph: ContentGraph;
  progress: Progress;
  config?: LearningPathConfig;
  newSeed?: () => string;
};

export const createLearningPathOver = ({ store, contentGraph, progress, config = DEFAULT_CONFIG, newSeed = randomUUID }: LearningPathDeps): LearningPath => {
  const strategy = STRATEGIES[config.strategy](config.bands);
  const learnerPath = async (learnerId: LearnerId, tx?: DbOrTx): Promise<LearnerPath> => {
    const stored = await store.get(learnerId, tx);
    if (stored) return stored;
    await store.insert(learnerId, { seed: newSeed(), activeTracks: DEFAULT_ACTIVE_TRACKS }, tx);
    return (await store.get(learnerId, tx))!;
  };
  const plan = async (learnerId: LearnerId, tx?: DbOrTx): Promise<{ plan: Plan; path: LearnerPath }> => {
    const [path, items, introduced] = await Promise.all([learnerPath(learnerId, tx), contentGraph.pathItems(), progress.introduced(learnerId, tx)]);
    return { path, plan: strategy({ items, seed: path.seed, introduced: new Set(introduced) }) };
  };
  return {
    async start(learnerId, tx) {
      await learnerPath(learnerId, tx);
    },
    activeTracks: async (learnerId, tx) => (await learnerPath(learnerId, tx)).activeTracks,
    async setActiveTracks(learnerId, tracks, tx) {
      const active = normaliseTracks(tracks);
      await learnerPath(learnerId, tx);
      await store.setActiveTracks(learnerId, active, tx);
      return active;
    },
    async next(learnerId, n, tx) {
      const { plan: p, path } = await plan(learnerId, tx);
      return p.next(path.activeTracks, n);
    },
    async nextAt(learnerId, level, n, tx) {
      const { plan: p, path } = await plan(learnerId, tx);
      return p.next(path.activeTracks.map(({ type }) => ({ level, type })), n);
    },
    forItem: async (learnerId, studyItemId, tx) => (await plan(learnerId, tx)).plan.forItem(studyItemId),
    isLocked: async (learnerId, studyItemId, tx) => (await plan(learnerId, tx)).plan.isLocked(studyItemId),
  };
};
