import { randomUUID } from "node:crypto";
import { createProgressOver, type Progress, type ReviewStore } from "./progress.ts";
import type { Review } from "./review.ts";

/** An in-memory Progress that passes the same contract as the real one. */
export const createFakeProgress = (): Progress => {
  const log: Review[] = [];
  const store: ReviewStore = {
    async append(review) {
      log.push(structuredClone(review));
    },
    async read(learnerId, studyItemId) {
      const mine = log.filter((r) => r.learnerId === learnerId && (!studyItemId || r.studyItemId === studyItemId));
      return structuredClone(mine.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
    },
  };
  return createProgressOver(store, randomUUID);
};
