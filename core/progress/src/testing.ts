import { resolve } from "node:path";
import { collectMigrations, migrate, type Db } from "@ibbun/db";

export { createFakeProgress } from "./fake-progress.ts";
export { createFakeTexts } from "./fake-texts.ts";

/** Applies the progress migrations to a test database. */
export const migrateProgress = async (db: Db) => {
  await migrate(db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
};
