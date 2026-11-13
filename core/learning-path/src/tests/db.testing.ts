import { afterAll, beforeAll } from "vitest";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { migrateLearningPath } from "../testing.ts";

/** A fresh database with the learning_path tables for the calling test file. Read `.db` inside tests. */
export const useLearningPathDb = (): { db: Db } => {
  const ref = {} as { db: Db; pg: TestPostgres };
  beforeAll(async () => {
    ref.pg = await startTestPostgres();
    ref.db = createDb(ref.pg.url, { max: 1 });
    await migrateLearningPath(ref.db);
  }, 60_000);
  afterAll(async () => {
    await ref.db.$client.end();
    await ref.pg.stop();
  });
  return ref;
};
