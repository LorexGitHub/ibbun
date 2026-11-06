import { resolve } from "node:path";
import { collectMigrations, migrate, type Db } from "@mojibun/db";
import { tables, type Graph } from "./graph.ts";

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
