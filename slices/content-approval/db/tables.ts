import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { RecordTable } from "@ibbun/content-graph/authoring";
import type { Rec } from "../src/drafts.ts";
import type { SampleKind, SampleReason, SampleStatus } from "../sampling/types.ts";

// The Drizzle view of db/migrations. The migrations are the source of truth.
const contentApproval = pgSchema("content_approval");

export const sample = contentApproval.table("sample", {
  id: uuid("id").primaryKey(),
  kind: text("kind").$type<SampleKind>().notNull(),
  reason: text("reason").$type<SampleReason>().notNull(),
  status: text("status").$type<SampleStatus>().notNull(),
  primaryTable: text("primary_table").$type<RecordTable>().notNull(),
  primaryId: uuid("primary_id").notNull(),
  unit: jsonb("unit").$type<Rec[]>().notNull(),
  decisionId: uuid("decision_id"),
  requestId: uuid("request_id"),
  model: text("model"),
  rubricVersion: text("rubric_version"),
  note: text("note"),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
});

export const kindState = contentApproval.table("kind_state", {
  kind: text("kind").$type<SampleKind>().primaryKey(),
  version: text("version"),
  calibrationLeft: integer("calibration_left").notNull(),
  paused: boolean("paused").notNull(),
  resumedAt: timestamp("resumed_at", { withTimezone: true, mode: "date" }),
  cursor: timestamp("cursor", { withTimezone: true, mode: "date" }),
});
