import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { collectMigrations, createDb, migrate, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";

/**
 * A fresh database with this package's tables for the calling test file, in Tokyo time:
 * a timestamp stored without its offset would read 9 hours off.
 * Read `.db` inside tests: it is set once `beforeAll` has run.
 */
export const useLearnerDb = (): { db: Db } => {
  const ref = {} as { db: Db; pg: TestPostgres };
  beforeAll(async () => {
    ref.pg = await startTestPostgres();
    // One connection: PGlite serves only one, and the time zone below is set per connection.
    ref.db = createDb(ref.pg.url, { max: 1 });
    await ref.db.execute(sql`SET TIME ZONE 'Asia/Tokyo'`);
    await migrate(ref.db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
  }, 60_000);
  afterAll(async () => {
    await ref.db.$client.end();
    await ref.pg.stop();
  });
  return ref;
};
