import { sql } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { migrateProgress } from "../testing.ts";

/** A fresh database with the progress tables for the calling test file. Read `.db` inside tests. */
export const useProgressDb = (): { db: Db } => {
  const ref = {} as { db: Db; pg: TestPostgres };
  beforeAll(async () => {
    ref.pg = await startTestPostgres();
    ref.db = createDb(ref.pg.url, { max: 1 });
    await ref.db.execute(sql`SET TIME ZONE 'Asia/Tokyo'`);
    await migrateProgress(ref.db);
  }, 60_000);
  afterAll(async () => {
    await ref.db.$client.end();
    await ref.pg.stop();
  });
  return ref;
};
