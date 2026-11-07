import { integer, jsonb, pgSchema, primaryKey, text, uuid } from "drizzle-orm/pg-core";

const schema = pgSchema("import");

export const snapshot = schema.table("snapshot", {
  dataset: text("dataset").primaryKey(),
  upstreamVersion: text("upstream_version").notNull(),
});

export const snapshotRecord = schema.table(
  "snapshot_record",
  { dataset: text("dataset").notNull(), key: text("key").notNull(), record: jsonb("record").$type<{ key: string }>().notNull() },
  (t) => [primaryKey({ columns: [t.dataset, t.key] })],
);

export const runDiff = schema.table("run_diff", {
  importRunId: uuid("import_run_id").primaryKey(),
  added: integer("added").notNull(),
  changed: integer("changed").notNull(),
  gone: integer("gone").notNull(),
});
