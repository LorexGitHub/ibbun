/** The four numbers of docs/content-approval.md#supervisor-spot-checks. */
export type SamplingConfig = {
  /** Share of the reviewer's approvals in each kind the supervisor sees (0 to 1). */
  sampleRate: number;
  /** Approvals sampled in a row after a rubric, prompt-template or model version changes. */
  calibration: number;
  /** How many of the latest sampled verdicts the error rate looks at. */
  errorWindow: number;
  /** A kind pauses when the share of rejected verdicts in the window is above this (0 to 1). */
  errorThreshold: number;
};

export const DEFAULT_SAMPLING: SamplingConfig = { sampleRate: 0.05, calibration: 20, errorWindow: 50, errorThreshold: 0.1 };
