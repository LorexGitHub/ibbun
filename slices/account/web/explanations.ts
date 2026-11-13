import type { Preferences } from "@ibbun/learner/client";

export type Explanations = Preferences["explanations"];
export type Language = "english" | "japanese";

/** Whether `language` is shown under `value`. */
export const shows = (value: Explanations, language: Language): boolean => value === "both" || value === language;

/**
 * The value after switching one language on or off, or null when that would leave both off:
 * at least one is always on (review-answer-model.md#toggles).
 */
export const switchLanguage = (value: Explanations, language: Language, on: boolean): Explanations | null => {
  const other: Language = language === "english" ? "japanese" : "english";
  const otherOn = shows(value, other);
  if (on) return otherOn ? "both" : language;
  return otherOn ? other : null;
};
