import { resolve } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { collectMigrations, createDb, migrate, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";

/**
 * A fresh database with this package's tables for the calling test file.
 * Read `.db` inside tests: it is set once `beforeAll` has run.
 */
export const useLearnerDb = (): { db: Db } => {
  const ref = {} as { db: Db; pg: TestPostgres };
  beforeAll(async () => {
    ref.pg = await startTestPostgres();
    ref.db = createDb(ref.pg.url, { max: 1 });
    await migrate(ref.db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
  }, 60_000);
  afterAll(async () => {
    await ref.db.$client.end();
    await ref.pg.stop();
  });
  return ref;
};
