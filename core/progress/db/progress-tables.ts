import { bigint, boolean, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// The Drizzle view of db/migrations. The migrations are the source of truth.
const progress = pgSchema("progress");

export const reviews = progress.table("reviews", {
  id: uuid("id").primaryKey(),
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  learnerId: uuid("learner_id").notNull(),
  studyItemId: uuid("study_item_id").notNull(),
  kind: text("kind").notNull(),
  passed: boolean("passed").notNull(),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
  detail: jsonb("detail").notNull(),
});

export const texts = progress.table("texts", {
  id: uuid("id").primaryKey(),
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  kind: text("kind").notNull(),
  learnerId: uuid("learner_id").notNull(),
  level: text("level").notNull(),
  passageId: uuid("passage_id").notNull(),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
  detail: jsonb("detail").notNull(),
});
