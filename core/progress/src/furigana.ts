import type { Mastery } from "./projection.ts";

/** The Learner's furigana setting, as `learner` stores it. */
export type FuriganaSetting = "on" | "off" | "mixed";

/** One Word with kanji, as the Learner meets it. */
export type FuriganaWord = { mastery: Mastery; reviewTarget?: boolean };

/** Whether a Word with kanji gets furigana (batch-text.md#furigana). Mixed: only Words still New, never a Review's target. */
export const showsFurigana = (setting: FuriganaSetting, word: FuriganaWord): boolean =>
  setting === "on" || (setting === "mixed" && word.mastery === "new" && !word.reviewTarget);
