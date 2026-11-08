import { resolve } from "node:path";
import { collectMigrations, migrate, type Db } from "@mojibun/db";
import type { Clock } from "./authoring/authoring.ts";
import { memoryStore } from "./authoring/store.ts";
import { answerFlags, type AnswerFlags } from "./flags/answer-flags.ts";
import { tables, type Graph } from "./graph.ts";
import { levels, type Levels } from "./levels/levels.ts";

export { createFakeAuthoring } from "./authoring/testing.ts";
export { createFakeContentGraph } from "./fake.ts";
export { n5Fixture, type N5Fixture } from "./fixture/n5.ts";
export { emptyGraph, type Graph } from "./graph.ts";
export * from "./schema.ts";

/** Applies the content_graph migrations to a test database. */
export const migrateContentGraph = async (db: Db) => {
  await migrate(db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
};

/** Inserts every row of `graph` into a migrated test database. */
export const seedContentGraph = async (db: Db, graph: Graph) => {
  for (const [name, table] of Object.entries(tables)) {
    const rows = graph[name as keyof Graph];
    if (rows.length) await db.insert(table).values(rows as never);
  }
};

/** The derived-level process over rows held in memory; it writes into `graph`. */
export const createFakeLevels = (graph: Graph, clock?: Clock): Levels => levels(memoryStore(graph), clock);

/** The answer-flag write over rows held in memory; it writes into `graph`. */
export const createFakeAnswerFlags = (graph: Graph, clock?: Clock): AnswerFlags => answerFlags(memoryStore(graph), clock);
