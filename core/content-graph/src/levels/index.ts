import type { DbOrTx } from "@mojibun/db";
import type { Clock } from "../authoring/authoring.ts";
import { postgresStore } from "../authoring/store.ts";
import { levels, type Levels } from "./levels.ts";

export { currentLevel, derivedLevel, hardest, PROCESS, VERSION } from "./levels.ts";
export type { Changed, Levels, RebuildResult } from "./levels.ts";
export * from "./schema.ts";

/** The derived-level process over Postgres. Pass a transaction to join a slice's own. */
export const createLevels = (db: DbOrTx, clock?: Clock): Levels => levels(postgresStore(db), clock);
