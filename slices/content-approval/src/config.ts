import type { JlptLevel } from "@ibbun/shared";

/** The numbers the checks and the reviewer's outcome use (docs/content-approval.md). */
export type ApprovalConfig = {
  /** Check 8: most characters a Sentence may have at each level. */
  lengthCaps: Record<JlptLevel, number>;
  /** Check 7: bigram similarity at or above which two Sentences are near-duplicates. */
  nearDuplicate: number;
  /** Below this reviewer confidence (0–1) a draft escalates instead of being approved. */
  minConfidence: number;
};

export const DEFAULT_CONFIG: ApprovalConfig = {
  lengthCaps: { N5: 25, N4: 35, N3: 50, N2: 70, N1: 100 },
  nearDuplicate: 0.85,
  minConfidence: 0.7,
};
