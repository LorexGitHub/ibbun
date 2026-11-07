import { boolean, doublePrecision, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentGraph } from "../schema.ts";

export const DECISION_OUTCOMES = ["approved", "rejected", "escalated", "retired"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export type Decider =
  | { kind: "reviewer"; model: string; rubricVersion: string }
  | { kind: "supervisor" }
  | { kind: "derived"; process: string; version: string };

export type Verdict = { criterion: string; pass: boolean; note?: string };

/** Append-only: a record's approval state is its latest decision (docs/content-approval.md#approval-decisions). */
export const approvalDecision = contentGraph.table("approval_decision", {
  id: uuid("id").primaryKey(),
  recordTable: text("record_table").notNull(),
  recordId: uuid("record_id").notNull(),
  outcome: text("outcome").$type<DecisionOutcome>().notNull(),
  decider: jsonb("decider").$type<Decider>().notNull(),
  verdicts: jsonb("verdicts").$type<Verdict[]>().notNull(),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

export const GENERATION_STATUSES = ["open", "in review", "done", "failed"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const generationRequest = contentGraph.table("generation_request", {
  id: uuid("id").primaryKey(),
  targetId: uuid("target_id").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  attempts: integer("attempts").notNull(),
  status: text("status").$type<GenerationStatus>().notNull(),
});

export const generationRun = contentGraph.table("generation_run", {
  id: uuid("id").primaryKey(),
  requestId: uuid("request_id").notNull(),
  model: text("model").notNull(),
  promptTemplateVersion: text("prompt_template_version").notNull(),
  inputs: jsonb("inputs").$type<unknown[]>().notNull(),
  tokens: integer("tokens").notNull(),
  cost: doublePrecision("cost").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

/** Why something waits in the Content Approval queue (content-approval.md, import-pipeline.md#the-queue). */
export const QUEUE_REASONS = [
  "stale override",
  "orphaned override",
  "example redrafted",
  "superseded",
  "unmatched sense",
  "suspended",
  "breaker tripped",
  "budget exhausted",
  "generation failed",
  "escalated",
  "staleness alarm",
  "level disagreement",
  "merge proposal",
  "sense alignment",
] as const;
export type QueueReason = (typeof QUEUE_REASONS)[number];

export const queueEntry = contentGraph.table("queue_entry", {
  id: uuid("id").primaryKey(),
  reason: text("reason").$type<QueueReason>().notNull(),
  recordId: uuid("record_id"),
  importRunId: uuid("import_run_id"),
  generationRunId: uuid("generation_run_id"),
  generationRequestId: uuid("generation_request_id"),
  detail: jsonb("detail").$type<unknown>(),
  resolved: boolean("resolved").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});
