import { integer, text, uuid } from "drizzle-orm/pg-core";
import type { JlptLevel } from "@ibbun/shared";
import { contentGraph } from "../schema.ts";

export const LEVELLED_TABLES = ["study_item", "sentence", "reading_passage", "listening_clip"] as const;
export type LevelledTable = (typeof LEVELLED_TABLES)[number];

export const levelProcess = contentGraph.table("level_process", {
  process: text("process").primaryKey(),
  version: text("version").notNull(),
  provenanceId: uuid("provenance_id").notNull(),
});

/** Cache: current levels of Study Items, computed levels of Sentences, Reading Passages and Listening Clips. */
export const computedLevel = contentGraph.table("computed_level", {
  recordId: uuid("record_id").primaryKey(),
  recordTable: text("record_table").$type<LevelledTable>().notNull(),
  level: text("level").$type<JlptLevel>(),
  unlevelledWordCount: integer("unlevelled_word_count").notNull(),
});
