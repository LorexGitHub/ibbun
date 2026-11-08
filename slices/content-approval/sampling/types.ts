import type { Rec } from "../src/drafts.ts";

/** The content kinds that are sampled; each has its own sample rate, calibration and error rate. */
export const SAMPLE_KINDS = ["example", "japanese-explanation", "grammar-fields", "listening-clip"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

/**
 * Why a record is in front of the supervisor. `calibration` and `random` are the samples the error rate is
 * computed from. `held` is a reviewer approval waiting because the kind is paused (the record is still a draft).
 * `re-review` was queued by the supervisor with a filter.
 */
export type SampleReason = "calibration" | "random" | "held" | "re-review";
export type SampleStatus = "pending" | "confirmed" | "rejected";

export type Sample = {
  id: string;
  kind: SampleKind;
  reason: SampleReason;
  status: SampleStatus;
  /** The record the supervisor looks at; also the last of `unit`. */
  primary: Rec;
  /** Every record the unit's decision applies to (docs/content-approval.md#units-of-approval). */
  unit: Rec[];
  /** The Approval Decision being sampled, when it was already recorded (clips). */
  decisionId: string | null;
  /** The Generation Request a held draft belongs to. */
  requestId: string | null;
  model: string | null;
  rubricVersion: string | null;
  note: string | null;
  at: Date;
  settledAt: Date | null;
};

/** Per kind: the version the last approval was made under, how many calibration approvals remain, and the pause. */
export type KindState = {
  kind: SampleKind;
  version: string | null;
  calibrationLeft: number;
  paused: boolean;
  /** Verdicts before this do not count towards the error rate; set when the supervisor resumes a kind. */
  resumedAt: Date | null;
  /** Listening Clip approvals are drawn after the fact; those up to this time have been. */
  cursor: Date | null;
};

export const freshState = (kind: SampleKind): KindState => ({ kind, version: null, calibrationLeft: 0, paused: false, resumedAt: null, cursor: null });

/** Where the slice keeps its sampling state. The real one is Postgres; the fake is memory. */
export type SamplingStore = {
  state(kind: SampleKind): Promise<KindState>;
  saveState(state: KindState): Promise<void>;
  add(sample: Sample): Promise<void>;
  get(id: string): Promise<Sample | undefined>;
  /** Oldest first. */
  list(filter?: { status?: SampleStatus; kind?: SampleKind }): Promise<Sample[]>;
  settle(id: string, status: "confirmed" | "rejected", note: string | null, at: Date): Promise<void>;
};
