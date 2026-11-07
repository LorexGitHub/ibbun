import type { JlptLevel } from "@mojibun/shared";

/** Shortest (短文) and longest (長文, or 中文 at N5 and N4) exam passage, in characters (research/jlpt-reading-formats.md). */
export const LENGTHS: Record<JlptLevel, { shortest: number; longest: number }> = {
  N5: { shortest: 80, longest: 250 },
  N4: { shortest: 100, longest: 400 },
  N3: { shortest: 100, longest: 550 },
  N2: { shortest: 200, longest: 900 },
  N1: { shortest: 200, longest: 1000 },
};

/** An Unlevelled batch grows in bands of this many Unlevelled items met, up to the N1 長文 length at the last band. */
export const UNLEVELLED_BAND_SIZE = 200;
export const UNLEVELLED_BANDS = 5;

/** About one earlier item per this many characters of target length. */
export const CHARACTERS_PER_EARLIER_ITEM = 50;

/** Passage types the generator rotates through, by level (batch-text.md#style). */
const BASIC = ["memo", "notice", "email", "diary", "short explanation"] as const;
const N3_TYPES = [...BASIC, "explanation", "short essay (随筆)"] as const;
const ADVANCED = [...N3_TYPES, "commentary (評論)", "argument (主張)"] as const;

export const PASSAGE_TYPES: Record<JlptLevel | "unlevelled", readonly string[]> = {
  N5: BASIC,
  N4: BASIC,
  N3: N3_TYPES,
  N2: ADVANCED,
  N1: ADVANCED,
  unlevelled: ADVANCED,
};
