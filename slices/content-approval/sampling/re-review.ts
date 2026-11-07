import type { ApprovalDecision, RecordTable } from "@mojibun/content-graph/authoring";
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

const generationRunOf = async (c: Context, table: RecordTable, id: string): Promise<string | undefined> => {
  const [row] = table === "example" ? await c.authoring.rows("example", { id }) : await c.authoring.rows("japaneseExplanation", { id });
  const [provenance] = row ? await c.authoring.rows("provenance", { id: row.provenanceId }) : [];
  return provenance?.source.kind === "generated" ? provenance.source.generationRunId : undefined;
};

/** A reviewer approval of an Example or Japanese Explanation that the model and rubric filters let through. */
const matches = (d: ApprovalDecision, f: ReReviewFilter): boolean =>
  d.outcome === "approved" &&
  d.decider.kind === "reviewer" &&
  (!f.model || d.decider.model === f.model) &&
  (!f.rubricVersion || d.decider.rubricVersion === f.rubricVersion);

const isLive = async (c: Context, d: ApprovalDecision) => (await c.authoring.approvalState(d.recordId)) === "approved";

const inRun = async (c: Context, d: ApprovalDecision, runId: string | undefined) =>
  !runId || (await generationRunOf(c, d.recordTable as RecordTable, d.recordId)) === runId;

const queue = async (c: Context, d: ApprovalDecision, unit: Unit) => {
  const reviewer = d.decider.kind === "reviewer" ? d.decider : null;
  await c.store.add(
    newSample(c, {
      kind: KIND_OF[d.recordTable as RecordTable]!,
      reason: "re-review",
      primary: unit.primary,
      unit: unit.records,
      decisionId: d.id,
      model: reviewer?.model ?? null,
      rubricVersion: reviewer?.rubricVersion ?? null,
    }),
  );
};

/** The unit to queue for this decision, or nothing when the record is no longer live, already waits, or is outside the Generation Run. */
const toQueue = async (c: Context, d: ApprovalDecision, filter: ReReviewFilter): Promise<Unit | undefined> => {
  const unit = await liveUnit(c, d.recordTable as RecordTable, d.recordId);
  if (!unit || !(await isLive(c, d)) || (await openFor(c, unit.primary.id)) || !(await inRun(c, d, filter.generationRunId))) return undefined;
  return unit;
};

/** Puts the live reviewer approvals that match the filter in front of the supervisor again. Returns how many it queued. */
export const reReview = async (c: Context, filter: ReReviewFilter): Promise<number> => {
  const candidates = (await c.authoring.rows("approvalDecision")).filter((d) => KIND_OF[d.recordTable as RecordTable] && matches(d, filter));
  let queued = 0;
  for (const d of candidates) {
    const unit = await toQueue(c, d, filter);
    if (unit) await queue(c, d, unit);
    if (unit) queued++;
  }
  return queued;
};
