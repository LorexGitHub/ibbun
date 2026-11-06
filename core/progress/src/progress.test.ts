import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { transaction } from "@mojibun/db";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { useProgressDb } from "./tests/db.testing.ts";
import { createFakeProgress } from "./fake.ts";
import { createProgress } from "./postgres.ts";
import { progressContract } from "./tests/progress.contract.ts";

describe("Progress, real", () => {
  const pg = useProgressDb();
  progressContract(async () => createProgress(pg.db));

  const review = () => ({
    learnerId: LearnerId.parse(randomUUID()),
    studyItemId: StudyItemId.parse(randomUUID()),
    kind: "srs" as const,
    passed: true,
    at: "2026-11-01T00:00:00Z",
  });

  it("refuses to update, delete or truncate the log", async () => {
    await createProgress(pg.db).record(review());
    for (const statement of [
      sql`UPDATE progress.reviews SET passed = false`,
      sql`DELETE FROM progress.reviews`,
      sql`TRUNCATE progress.reviews`,
    ]) {
      await expect(pg.db.execute(statement)).rejects.toThrow();
    }
  });

  it("records inside the caller's transaction", async () => {
    const progress = createProgress(pg.db);
    const r = review();
    await expect(
      transaction(pg.db, async (tx) => {
        await progress.record(r, tx);
        expect(await progress.log(r.learnerId, undefined, tx)).toHaveLength(1);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(await progress.log(r.learnerId)).toEqual([]);
  });
});

describe("Progress, fake", () => {
  progressContract(async () => createFakeProgress());
});
