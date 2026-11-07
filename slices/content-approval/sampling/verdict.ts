import type { DecisionOutcome } from "@mojibun/content-graph/authoring";
import { StudyItemId } from "@mojibun/shared";
import type { Rec } from "../src/drafts.ts";
import { retry } from "../src/retry.ts";
import type { Context } from "./context.ts";
import { exceedsThreshold, latestVerdicts } from "./rules.ts";
import type { Sample, SampleKind } from "./types.ts";

const SUPERVISOR = { kind: "supervisor" } as const;

/** The Study Item a Learner meets through a Japanese Explanation: its word sense's Word, or its Grammar Point. */
const studyItemOfExplanation = async (c: Context, id: string): Promise<StudyItemId | undefined> => {
  const [explanation] = await c.authoring.rows("japaneseExplanation", { id });
  const [sense] = explanation?.wordSenseId ? await c.authoring.rows("wordSense", { id: explanation.wordSenseId }) : [];
  const item = explanation?.grammarPointId ?? sense?.wordId;
  return item ? StudyItemId.parse(item) : undefined;
};

const metThroughSentence = async (c: Context, sentenceId: string): Promise<boolean> => {
  const examples = await c.authoring.rows("example", { sentenceId });
  return (await Promise.all(examples.map((e) => c.progress.met({ exampleId: e.id })))).some(Boolean);
};

/** Whether any Learner has met the record: an Example by its Reviews, a Sentence through its Examples, an explanation through its Study Item. */
const metBy = async (c: Context, { table, id }: Rec): Promise<boolean> => {
  if (table === "example") return c.progress.met({ exampleId: id });
  if (table === "sentence") return metThroughSentence(c, id);
  const item = table === "japaneseExplanation" ? await studyItemOfExplanation(c, id) : undefined;
  return item ? c.progress.met({ studyItemId: item }) : false;
};

const decideUnit = async (c: Context, unit: Rec[], outcome: DecisionOutcome, reason: string | null) => {
  for (const { table, id } of unit) await c.authoring.decide({ recordTable: table, recordId: id, outcome, decider: SUPERVISOR, reason });
};

/** Live content the supervisor rejects: Retired if any Learner has met it, Rejected otherwise. A Retired Example is topped up by core. */
const takeDown = async (c: Context, s: Sample, reason: string | null) =>
  decideUnit(c, s.unit, (await metBy(c, s.primary)) ? "retired" : "rejected", reason);

/** A held draft the supervisor rejects goes back to the generator like any other rejection. */
const rejectHeld = async (c: Context, s: Sample, reason: string | null) => {
  await decideUnit(c, s.unit, "rejected", reason);
  if (s.requestId) await retry(c, s.requestId, [reason ?? "the supervisor rejected the draft"]);
};

const act = (c: Context, s: Sample, verdict: "confirm" | "reject", note: string | null) => {
  if (s.reason === "held") return verdict === "confirm" ? decideUnit(c, s.unit, "approved", note) : rejectHeld(c, s, note);
  return verdict === "reject" ? takeDown(c, s, note) : undefined;
};

const pauseWhenFailing = async (c: Context, kind: SampleKind) => {
  const state = await c.store.state(kind);
  const verdicts = latestVerdicts(await c.store.list({ kind }), state, c.config.errorWindow);
  if (!state.paused && exceedsThreshold(verdicts, c.config)) await c.store.saveState({ ...state, paused: true });
};

/** Settles a sample. Confirming a held draft approves it; rejecting live content takes it down; either may pause the kind. */
export const verdict = async (c: Context, id: string, decision: "confirm" | "reject", note: string | null = null) => {
  const s = await c.store.get(id);
  if (!s) throw new Error(`no sample ${id}`);
  if (s.status !== "pending") throw new Error(`sample ${id} was already settled`);
  await act(c, s, decision, note);
  await c.store.settle(id, decision === "confirm" ? "confirmed" : "rejected", note, c.now());
  await pauseWhenFailing(c, s.kind);
};

/** Resumes a paused kind. Verdicts before now no longer count, so one resume is not undone by the same 50 samples. */
export const resume = async (c: Context, kind: SampleKind) => {
  await c.store.saveState({ ...(await c.store.state(kind)), paused: false, resumedAt: c.now() });
};
