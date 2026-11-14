import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentGraph } from "@ibbun/content-graph";
import { transaction } from "@ibbun/db";
import { createFakeProgress } from "@ibbun/progress/testing";
import { LearnerId } from "@ibbun/shared";
import { createFakeLearningPath } from "./fake-learning-path.ts";
import { createLearningPath } from "./learning-path-postgres.ts";
import { useLearningPathDb } from "./tests/db.testing.ts";
import { learningPathContract } from "./tests/learning-path.contract.ts";

describe("LearningPath, real", () => {
  const pg = useLearningPathDb();
  learningPathContract(async (deps) => createLearningPath(pg.db, deps));

  it("writes inside the caller's transaction", async () => {
    const path = createLearningPath(pg.db, { contentGraph: { pathItems: async () => [] } as unknown as ContentGraph, progress: createFakeProgress() });
    const l = LearnerId.parse(randomUUID());
    await path.start(l);
    await expect(
      transaction(pg.db, async (tx) => {
        await path.setActiveTracks(l, [], tx);
        expect(await path.activeTracks(l, tx)).toEqual([]);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(await path.activeTracks(l)).toHaveLength(4);
  });
});

describe("LearningPath, fake", () => {
  learningPathContract(async (deps) => createFakeLearningPath(deps));
});
