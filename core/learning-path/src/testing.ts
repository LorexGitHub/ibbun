import { resolve } from "node:path";
import { collectMigrations, migrate, type Db } from "@ibbun/db";

export { createFakeLearningPath } from "./fake-learning-path.ts";

/** Applies the learning_path migrations to a test database. */
export const migrateLearningPath = async (db: Db) => {
  await migrate(db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
};
