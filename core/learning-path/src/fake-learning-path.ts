import { createLearningPathOver, type LearningPath, type LearningPathDeps, type LearnerPath } from "./learning-path.ts";

/** An in-memory Learning Path that passes the same contract as the real one. */
export const createFakeLearningPath = (deps: Omit<LearningPathDeps, "store">): LearningPath => {
  const rows = new Map<string, LearnerPath>();
  return createLearningPathOver({
    ...deps,
    store: {
      get: async (learnerId) => structuredClone(rows.get(learnerId) ?? null),
      async insert(learnerId, path) {
        if (!rows.has(learnerId)) rows.set(learnerId, structuredClone(path));
      },
      async setActiveTracks(learnerId, tracks) {
        rows.get(learnerId)!.activeTracks = structuredClone(tracks);
      },
    },
  });
};
