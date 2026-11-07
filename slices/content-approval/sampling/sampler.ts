import { randomUUID } from "node:crypto";
import type { Authoring, DecisionOutcome, RecordTable } from "@mojibun/content-graph/authoring";
import type { Jobs } from "@mojibun/jobs";
import type { Progress } from "@mojibun/progress";
import { StudyItemId } from "@mojibun/shared";
import { exampleDraft, type Rec } from "../src/drafts.ts";
import { retry } from "../src/retry.ts";
import type { SamplingConfig } from "./config.ts";
import { draw, errorRate, exceedsThreshold, latestVerdicts } from "./rules.ts";
import { SAMPLE_KINDS, type KindState, type Sample, type SampleKind, type SamplingStore } from "./types.ts";

export type SamplingDeps = {
  store: SamplingStore;
  authoring: Authoring;
  progress: Progress;
  jobs: Jobs;
  config: SamplingConfig;
  random?: () => number;
  now?: () => Date;
};

/** One approval the reviewer wants to make, as the sampler sees it. */
export type Approval = {
  kind: "example" | "japanese-explanation";
  /** The reviewer's model and rubric version: a change in either starts a calibration run. */
  model: string;
  rubricVersion: string;
  primary: Rec;
  unit: Rec[];
  requestId: string;
};

export type KindReport = { kind: SampleKind; paused: boolean; calibrationLeft: number; sampled: number; errorRate: number };

export type ReReviewFilter = { generationRunId?: string; rubricVersion?: string; model?: string };

const SUPERVISOR = { kind: "supervisor" } as const;

const RECORD_KIND: Partial<Record<RecordTable, "example" | "japanese-explanation">> = { example: "example", japaneseExplanation: "japanese-explanation" };

/** Spot-check sampling: draws samples from the reviewer's approvals, keeps the error rates and the pauses, and acts on the supervisor's verdicts. */
export const createSampling = (deps: SamplingDeps) => {
  const { store, authoring, progress, config } = deps;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? (() => new Date());

  const newSample = (s: Pick<Sample, "kind" | "reason" | "primary" | "unit"> & Partial<Sample>): Sample => ({
    id: randomUUID(),
    status: "pending",
    decisionId: null,
    requestId: null,
    model: null,
    rubricVersion: null,
    note: null,
    at: now(),
    settledAt: null,
    ...s,
  });

  const openFor = async (primary: Rec) => (await store.list({ status: "pending" })).find((s) => s.primary.id === primary.id);

  /**
   * The reviewer approved a draft. Returns `hold` when its kind is paused (the draft then waits for the supervisor,
   * who sees it as a `held` sample) and `approve` otherwise, after drawing the approval for a spot-check.
   */
  const admit = async (approval: Approval): Promise<"approve" | "hold"> => {
    const { kind, model, rubricVersion, primary, unit, requestId } = approval;
    const state = await store.state(kind);
    const reviewer = { model, rubricVersion, requestId };
    if (state.paused) {
      if (!(await openFor(primary))) await store.add(newSample({ kind, reason: "held", primary, unit, ...reviewer }));
      return "hold";
    }
    const drawn = draw(state, `${model}/${rubricVersion}`, config, random);
    await store.saveState(drawn.state);
    if (drawn.reason) await store.add(newSample({ kind, reason: drawn.reason, primary, unit, ...reviewer }));
    return "approve";
  };

  /** The Study Item a Learner meets through this record, if it is one a Learner meets through a Study Item. */
  const studyItemOf = async ({ table, id }: Rec): Promise<StudyItemId | undefined> => {
    if (table !== "japaneseExplanation") return undefined;
    const [explanation] = await authoring.rows("japaneseExplanation", { id });
    const [sense] = explanation?.wordSenseId ? await authoring.rows("wordSense", { id: explanation.wordSenseId }) : [];
    const item = explanation?.grammarPointId ?? sense?.wordId;
    return item ? StudyItemId.parse(item) : undefined;
  };

  const metBy = async (rec: Rec): Promise<boolean> => {
    if (rec.table === "example") return progress.met({ exampleId: rec.id });
    if (rec.table === "sentence") {
      const examples = await authoring.rows("example", { sentenceId: rec.id });
      return (await Promise.all(examples.map((e) => progress.met({ exampleId: e.id })))).some(Boolean);
    }
    const item = await studyItemOf(rec);
    return item ? progress.met({ studyItemId: item }) : false;
  };

  const decideUnit = async (unit: Rec[], outcome: DecisionOutcome, reason: string | null) => {
    for (const { table, id } of unit) await authoring.decide({ recordTable: table, recordId: id, outcome, decider: SUPERVISOR, reason });
  };

  /** Live content the supervisor rejects: Retired if any Learner has met it, Rejected otherwise. A Retired Example is topped up by core. */
  const takeDown = async (s: Sample, reason: string | null) => decideUnit(s.unit, (await metBy(s.primary)) ? "retired" : "rejected", reason);

  const pauseWhenFailing = async (kind: SampleKind) => {
    const state = await store.state(kind);
    const verdicts = latestVerdicts(await store.list({ kind }), state, config.errorWindow);
    if (!state.paused && exceedsThreshold(verdicts, config)) await store.saveState({ ...state, paused: true });
  };

  /** A held draft the supervisor rejects goes back to the generator like any other rejection. */
  const rejectHeld = async (s: Sample, reason: string | null) => {
    await decideUnit(s.unit, "rejected", reason);
    if (s.requestId) await retry({ authoring, jobs: deps.jobs }, s.requestId, [reason ?? "the supervisor rejected the draft"]);
  };

  const verdict = async (id: string, verdict: "confirm" | "reject", note: string | null = null) => {
    const s = await store.get(id);
    if (!s) throw new Error(`no sample ${id}`);
    if (s.status !== "pending") throw new Error(`sample ${id} was already settled`);
    if (s.reason === "held") {
      if (verdict === "confirm") await decideUnit(s.unit, "approved", note);
      else await rejectHeld(s, note);
    } else if (verdict === "reject") await takeDown(s, note);
    await store.settle(id, verdict === "confirm" ? "confirmed" : "rejected", note, now());
    await pauseWhenFailing(s.kind);
  };

  /** Resumes a paused kind. Verdicts before now no longer count, so one resume is not undone by the same 50 samples. */
  const resume = async (kind: SampleKind) => {
    const state = await store.state(kind);
    await store.saveState({ ...state, paused: false, resumedAt: now() });
  };

  /** The reviewer approvals matching the filter that are still live, as units for the supervisor to look at again. */
  const reReview = async (filter: ReReviewFilter): Promise<number> => {
    const live = (await authoring.rows("approvalDecision")).filter((d) => matches(d, filter) && RECORD_KIND[d.recordTable as RecordTable]);
    let queued = 0;
    for (const d of live) {
      const table = d.recordTable as RecordTable;
      const unit = await liveUnit(table, d.recordId);
      if (!unit || (await authoring.approvalState(d.recordId)) !== "approved" || (await openFor(unit.primary))) continue;
      if (filter.generationRunId && (await generationRunOf(table, d.recordId)) !== filter.generationRunId) continue;
      const decider = d.decider.kind === "reviewer" ? d.decider : null;
      await store.add(newSample({ kind: RECORD_KIND[table]!, reason: "re-review", primary: unit.primary, unit: unit.records, decisionId: d.id, model: decider?.model ?? null, rubricVersion: decider?.rubricVersion ?? null }));
      queued++;
    }
    return queued;
  };

  const matches = (d: { outcome: string; decider: { kind: string; model?: string; rubricVersion?: string } }, f: ReReviewFilter) =>
    d.outcome === "approved" && d.decider.kind === "reviewer" && (!f.model || d.decider.model === f.model) && (!f.rubricVersion || d.decider.rubricVersion === f.rubricVersion);

  const liveUnit = async (table: RecordTable, id: string): Promise<{ primary: Rec; records: Rec[] } | undefined> => {
    if (table === "example") {
      const [example] = await authoring.rows("example", { id, retired: false });
      return example && exampleDraft(authoring, example, "approved");
    }
    const [explanation] = await authoring.rows("japaneseExplanation", { id, retired: false });
    return explanation && { primary: { table, id }, records: [{ table, id }] };
  };

  const generationRunOf = async (table: RecordTable, id: string): Promise<string | undefined> => {
    const [row] = table === "example" ? await authoring.rows("example", { id }) : await authoring.rows("japaneseExplanation", { id });
    const [provenance] = row ? await authoring.rows("provenance", { id: row.provenanceId }) : [];
    return provenance?.source.kind === "generated" ? provenance.source.generationRunId : undefined;
  };

  /** Draws Listening Clip approvals the same way. Clip audio is approved by a derived process, so no reviewer sees it (docs/content-approval.md#listening-clips). Safe to run again. */
  const sweepClips = async () => {
    const since = (await store.state("listening-clip")).cursor;
    const approvals = (await authoring.rows("approvalDecision")).filter(
      (d) => d.outcome === "approved" && d.decider.kind === "derived" && d.decider.process.startsWith("listening") && (!since || d.at > since),
    );
    for (const d of approvals.sort((a, b) => a.at.getTime() - b.at.getTime())) {
      const version = d.decider.kind === "derived" ? `${d.decider.process}/${d.decider.version}` : "";
      const drawn = draw(await store.state("listening-clip"), version, config, random);
      await store.saveState({ ...drawn.state, cursor: d.at });
      const primary = { table: d.recordTable as RecordTable, id: d.recordId };
      if (drawn.reason) await store.add(newSample({ kind: "listening-clip", reason: drawn.reason, primary, unit: [primary], decisionId: d.id }));
    }
  };

  const states = async (): Promise<KindState[]> => Promise.all(SAMPLE_KINDS.map((kind) => store.state(kind)));

  /** Per kind: the pause, calibration still to go and the running error rate over the latest verdicts. */
  const reports = async (): Promise<KindReport[]> =>
    Promise.all(
      (await states()).map(async (state) => {
        const verdicts = latestVerdicts(await store.list({ kind: state.kind }), state, config.errorWindow);
        return { kind: state.kind, paused: state.paused, calibrationLeft: state.calibrationLeft, sampled: verdicts.length, errorRate: errorRate(verdicts) };
      }),
    );

  return { admit, verdict, resume, reReview, sweepClips, states, reports, samples: store.list, sample: store.get };
};

export type Sampling = ReturnType<typeof createSampling>;
