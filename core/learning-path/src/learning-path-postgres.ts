import { eq } from "drizzle-orm";
import type { DbOrTx } from "@ibbun/db";
import { learnerPath } from "../db/learning-path-tables.ts";
import { createLearningPathOver, type LearningPath, type LearningPathDeps, type LearnerPathStore } from "./learning-path.ts";
import { parseTrackKey, trackKey } from "./track.ts";

const postgresStore = (db: DbOrTx): LearnerPathStore => ({
  async get(learnerId, tx = db) {
    const [row] = await tx.select().from(learnerPath).where(eq(learnerPath.learnerId, learnerId));
    return row ? { seed: row.seed, activeTracks: row.activeTracks.map(parseTrackKey) } : null;
  },
  async insert(learnerId, path, tx = db) {
    await tx
      .insert(learnerPath)
      .values({ learnerId, seed: path.seed, activeTracks: path.activeTracks.map(trackKey) })
      .onConflictDoNothing();
  },
  async setActiveTracks(learnerId, tracks, tx = db) {
    await tx.update(learnerPath).set({ activeTracks: tracks.map(trackKey) }).where(eq(learnerPath.learnerId, learnerId));
  },
});

/** The Learning Path over Postgres, reading the given Content Graph and Progress. */
export const createLearningPath = (db: DbOrTx, deps: Omit<LearningPathDeps, "store">): LearningPath =>
  createLearningPathOver({ ...deps, store: postgresStore(db) });
