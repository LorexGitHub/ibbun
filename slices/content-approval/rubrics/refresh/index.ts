import type { Authoring, Decider, DecisionOutcome, QueueEntry, QueueReason, Row } from "@ibbun/content-graph/authoring";
import type { Llm } from "@ibbun/llm";
import { levelOf } from "../../src/checks.ts";
import type { ApprovalConfig } from "../../src/config.ts";
import { exampleDraft, type Rec } from "../../src/drafts.ts";
import { judge, ReviewerAnswer, type Judgement } from "../../src/reviewer.ts";
import { fill, rubricFor } from "../../src/rubrics.ts";

/** Flags a refresh (or the Kanji level cross-check) puts in the queue that the reviewer agent handles (docs/content-approval.md#what-it-handles). */
export const REFRESH_REASONS = ["stale override", "orphaned override", "example redrafted", "superseded", "unmatched sense", "level disagreement"] as const satisfies readonly QueueReason[];
export type RefreshReason = (typeof REFRESH_REASONS)[number];

const isRefreshReason = (reason: QueueReason): reason is RefreshReason => (REFRESH_REASONS as readonly QueueReason[]).includes(reason);

const REFRESH_ROOT = import.meta.dirname;

/** One rubric per reason, kept at `rubrics/refresh/<reason with dashes>/v<N>.md`. */
const rubricOf = (reason: RefreshReason) => rubricFor(reason.replaceAll(" ", "-"), REFRESH_ROOT);

export type RefreshDeps = { authoring: Authoring; llm: Llm; config: ApprovalConfig };

type Detail = Record<string, unknown>;
const detailOf = (entry: QueueEntry) => entry.detail as Detail;
const show = (value: unknown): string => (value === undefined || value === null ? "none" : typeof value === "string" ? value : JSON.stringify(value));

/** The tables an override's record can live in, searched for the upstream value now. */
const UPSTREAM_TABLES = ["wordForm", "wordReading", "wordSense"] as const;

const upstreamValue = async (a: Authoring, recordId: string, field: string): Promise<unknown> => {
  for (const table of UPSTREAM_TABLES) {
    const [row] = await a.rows(table, { id: recordId });
    if (row) return (row as Record<string, unknown>)[field];
  }
  return undefined;
};

/** What a reviewer needs to judge an override flag: the override row and the upstream value it replaced and now faces. */
const overrideFacts = async (a: Authoring, entry: QueueEntry) => {
  const { overrideId, field, suggestedTarget } = detailOf(entry);
  const [override] = await a.rows("override", { id: String(overrideId) });
  if (!override) throw new Error(`queue entry ${entry.id} names no override`);
  const targetId = typeof suggestedTarget === "string" ? suggestedTarget : override.recordId;
  return {
    override,
    values: {
      record: override.recordId,
      field: show(field ?? override.field),
      basedOn: show(override.basedOn),
      upstream: show(await upstreamValue(a, targetId, override.field)),
      override: show(override.value),
      successor: show(suggestedTarget),
    },
  };
};

/** A drafted Example, as one unit with its Sentence, answer data and links. */
const exampleFacts = async (a: Authoring, example: Row<"example">, entry: QueueEntry) => {
  const draft = await exampleDraft(a, example);
  const { sentence } = draft;
  return {
    draft,
    values: {
      level: String(await levelOf(a, example.studyItemId)),
      text: sentence.text,
      translation: show(sentence.translationEn),
      span: sentence.text.slice(example.spanStart, example.spanEnd),
      detail: show(entry.detail),
    },
  };
};

/** What approving or rejecting does, and what the reviewer is told. The record is the one thing a decision applies to. */
type Subject =
  | { kind: "override"; override: Row<"override"> }
  | { kind: "unit"; records: Rec[]; primary: Rec }
  | { kind: "kanji" };

type Prepared = { subject: Subject; values: Record<string, string> };

const unmatchedSenseFacts = async (a: Authoring, entry: QueueEntry): Promise<Prepared> => {
  const [example] = await a.rows("example", { id: entry.recordId! });
  if (example) {
    const { draft, values } = await exampleFacts(a, example, entry);
    return { subject: { kind: "unit", records: draft.records, primary: draft.primary }, values: { ...values, record: `Example ${example.id}` } };
  }
  const [explanation] = await a.rows("japaneseExplanation", { id: entry.recordId! });
  if (!explanation) throw new Error(`unmatched sense entry ${entry.id} names no Example or Japanese Explanation`);
  const primary: Rec = { table: "japaneseExplanation", id: explanation.id };
  return { subject: { kind: "unit", records: [primary], primary }, values: { record: `Japanese Explanation ${explanation.id}`, text: explanation.text, detail: show(entry.detail) } };
};

const levelFlagFacts = async (a: Authoring, entry: QueueEntry): Promise<Prepared> => {
  const [kanji] = await a.rows("kanji", { studyItemId: entry.recordId! });
  const level = await levelOf(a, entry.recordId!);
  return { subject: { kind: "kanji" }, values: { target: kanji!.literal, level: level === null ? "Unlevelled" : level, detail: show(entry.detail) } };
};

const overrideFlagFacts = async (a: Authoring, entry: QueueEntry): Promise<Prepared> => {
  const { override, values } = await overrideFacts(a, entry);
  return { subject: { kind: "override", override }, values };
};

const exampleFlagFacts = async (a: Authoring, entry: QueueEntry): Promise<Prepared> => {
  const [example] = await a.rows("example", { id: entry.recordId! });
  if (!example) throw new Error(`${entry.reason} entry ${entry.id} names no Example`);
  const { draft, values } = await exampleFacts(a, example, entry);
  return { subject: { kind: "unit", records: draft.records, primary: draft.primary }, values };
};

/** How each reason's flag is turned into what the reviewer sees and what a decision applies to. */
const PREPARE: Record<RefreshReason, (a: Authoring, entry: QueueEntry) => Promise<Prepared>> = {
  "stale override": overrideFlagFacts,
  "orphaned override": overrideFlagFacts,
  "example redrafted": exampleFlagFacts,
  superseded: exampleFlagFacts,
  "unmatched sense": unmatchedSenseFacts,
  "level disagreement": levelFlagFacts,
};

/** Overrides are never deleted: rejecting one retires it. */
const retireOverride = (a: Authoring, override: Row<"override">) => a.update("override", { id: override.id }, { retired: true });

/**
 * The reviewer never moves an override to another record and never writes a Level Candidate: those are the
 * supervisor's calls (import-pipeline.md#overrides, content-approval.md#when-it-escalates). They escalate whatever the verdict.
 */
const settle = (reason: RefreshReason, judgement: Judgement): Judgement => {
  if (judgement.outcome === "approved" && reason === "orphaned override") return { outcome: "escalated", reason: "moving an override to a new target is the supervisor's call" };
  if (judgement.outcome === "rejected" && reason === "level disagreement") return { outcome: "escalated", reason: "a new Editorial Level Candidate is the supervisor's call" };
  return judgement;
};

const apply = async (a: Authoring, entry: QueueEntry, subject: Subject, judgement: Judgement, decider: Decider, verdicts: { criterion: string; pass: boolean; note: string }[]) => {
  const outcome: DecisionOutcome = judgement.outcome;
  const reason = "reason" in judgement ? judgement.reason : undefined;
  if (judgement.outcome === "escalated") {
    // A draft's escalation is recorded on its primary record; anything else is queued for the supervisor directly.
    if (subject.kind === "unit") await a.decide({ recordTable: subject.primary.table, recordId: subject.primary.id, outcome, decider, reason, verdicts });
    else await a.enqueue({ reason: "escalated", recordId: entry.recordId, importRunId: entry.importRunId, detail: { from: entry.reason, reason } });
  } else if (subject.kind === "unit") {
    for (const { table, id } of subject.records) await a.decide({ recordTable: table, recordId: id, outcome, decider, reason, verdicts });
  } else if (subject.kind === "override") {
    if (judgement.outcome === "approved") await a.update("override", { id: subject.override.id }, { state: "active" });
    else await retireOverride(a, subject.override);
  }
  await a.resolve(entry.id);
};

/** Reviews one flag against its reason's rubric and acts on the verdict. */
export const reviewFlag = async (d: RefreshDeps, entry: QueueEntry, reason: RefreshReason) => {
  const rubric = rubricOf(reason);
  const { subject, values } = await PREPARE[reason](d.authoring, entry);
  const result = await d.llm.review({
    system: `Judge the flag against every criterion. Rubric ${rubric.version}.`,
    prompt: fill(rubric.template, values),
    output: ReviewerAnswer,
  });
  const verdicts = result.output.verdicts.map((v) => ({ criterion: v.criterion, pass: v.pass, note: v.note }));
  const judgement = settle(reason, judge(rubric.criteria, result.output, d.config.minConfidence));
  const decider: Decider = { kind: "reviewer", model: result.model, rubricVersion: rubric.version };
  await apply(d.authoring, entry, subject, judgement, decider, verdicts);
  return judgement;
};

/** Reviews every open refresh flag in the queue. A flag is resolved once decided, so running again only meets what is still open. */
export const reviewRefreshFlags = async (d: RefreshDeps) => {
  const outcomes: Judgement[] = [];
  for (const entry of await d.authoring.queue()) {
    if (isRefreshReason(entry.reason) && entry.recordId) outcomes.push(await reviewFlag(d, entry, entry.reason));
  }
  return outcomes;
};
