import type { ApprovalDecision, RecordTable } from "@ibbun/content-graph/authoring";
import { exampleDraft, type Rec } from "../src/drafts.ts";
import { newSample, openFor, type Context } from "./context.ts";
import type { SampleKind } from "./types.ts";

export type ReReviewFilter = { generationRunId?: string; rubricVersion?: string; model?: string };

const KIND_OF: Partial<Record<RecordTable, SampleKind>> = { example: "example", japaneseExplanation: "japanese-explanation" };

type Unit = { primary: Rec; records: Rec[] };

/** The unit a live record is decided with, or nothing when the record is gone or already retired. */
const liveUnit = async (c: Context, table: RecordTable, id: string): Promise<Unit | undefined> => {
  if (table === "example") {
    const [example] = await c.authoring.rows("example", { id, retired: false });
    return example && exampleDraft(c.authoring, example, "approved");
  }
  const [explanation] = await c.authoring.rows("japaneseExplanation", { id, retired: false });
  return explanation && { primary: { table, id }, records: [{ table, id }] };
};

/** The Generation Run that wrote a live record; the unit lookup has just found the record, so its Provenance exists. */
const generationRunOf = async (c: Context, unit: Unit): Promise<string | undefined> => {
  const { table, id } = unit.primary;
  const [row] = table === "example" ? await c.authoring.rows("example", { id }) : await c.authoring.rows("japaneseExplanation", { id });
  const [provenance] = await c.authoring.rows("provenance", { id: row!.provenanceId });
  return provenance!.source.kind === "generated" ? provenance!.source.generationRunId : undefined;
};

type ReviewerApproval = ApprovalDecision & { decider: Extract<ApprovalDecision["decider"], { kind: "reviewer" }> };

/** A reviewer approval that the model and rubric filters let through. */
const matches = (d: ApprovalDecision, f: ReReviewFilter): d is ReviewerApproval =>
  d.outcome === "approved" &&
  d.decider.kind === "reviewer" &&
  (!f.model || d.decider.model === f.model) &&
  (!f.rubricVersion || d.decider.rubricVersion === f.rubricVersion);

const isLive = async (c: Context, d: ApprovalDecision) => (await c.authoring.approvalState(d.recordId)) === "approved";

const inRun = async (c: Context, unit: Unit, runId: string | undefined) => !runId || (await generationRunOf(c, unit)) === runId;

const queue = (c: Context, d: ReviewerApproval, unit: Unit) =>
  c.store.add(
    newSample(c, {
      kind: KIND_OF[d.recordTable as RecordTable]!,
      reason: "re-review",
      primary: unit.primary,
      unit: unit.records,
      decisionId: d.id,
      model: d.decider.model,
      rubricVersion: d.decider.rubricVersion,
    }),
  );

/** The unit to queue for this decision, or nothing when the record is no longer live, already waits, or is outside the Generation Run. */
const toQueue = async (c: Context, d: ReviewerApproval, filter: ReReviewFilter): Promise<Unit | undefined> => {
  const unit = await liveUnit(c, d.recordTable as RecordTable, d.recordId);
  if (!unit || !(await isLive(c, d)) || (await openFor(c, unit.primary.id)) || !(await inRun(c, unit, filter.generationRunId))) return undefined;
  return unit;
};

/** Puts the live reviewer approvals that match the filter in front of the supervisor again. Returns how many it queued. */
export const reReview = async (c: Context, filter: ReReviewFilter): Promise<number> => {
  const candidates = (await c.authoring.rows("approvalDecision")).filter((d): d is ReviewerApproval => matches(d, filter) && !!KIND_OF[d.recordTable as RecordTable]);
  let queued = 0;
  for (const d of candidates) {
    const unit = await toQueue(c, d, filter);
    if (unit) await queue(c, d, unit);
    if (unit) queued++;
  }
  return queued;
};
