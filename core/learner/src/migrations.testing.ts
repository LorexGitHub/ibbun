import { resolve } from "node:path";
import { collectMigrations } from "@mojibun/db";

/** This package's migrations, for tests that need its tables in a fresh database. */
export const learnerMigrations = () => collectMigrations([resolve(import.meta.dirname, "..")]);
