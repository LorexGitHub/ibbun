/** Where in the level's exam range each length the Learner can choose sits: 0 is the shortest, 1 the longest. */
export const LENGTH_SHARE = { short: 0, medium: 0.5, exam: 1 } as const;
export type Length = keyof typeof LENGTH_SHARE;

/** The share of an exam-length dialogue's lines each length gets, never under the N5 count. */
export const DIALOGUE_LINE_SHARE: Record<Length, number> = { short: 0.5, medium: 0.75, exam: 1 };
