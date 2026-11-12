import { z } from "zod";

/** Furigana on every Word with kanji, on none, or only on Words still New to the Learner (batch-text.md#furigana). */
export const Furigana = z.enum(["on", "off", "mixed"]);
export type Furigana = z.infer<typeof Furigana>;

/**
 * Which explanations a prompt shows (review-answer-model.md#toggles). The two
 * toggles are one value, so "both off" cannot be stored.
 */
export const Explanations = z.enum(["english", "japanese", "both"]);
export type Explanations = z.infer<typeof Explanations>;

export const Preferences = z.object({
  furigana: Furigana,
  /** Convert romaji to kana as the Learner types. */
  convertRomaji: z.boolean(),
  explanations: Explanations,
  /** Ask Listening the way the JLPT does (listening.md#exam-mode). */
  examMode: z.boolean(),
  /** Play Listening audio at 0.75×. Sticky. */
  slowAudio: z.boolean(),
  /** Study Items per Learn batch. */
  batchSize: z.number().int().min(1).max(20),
});
export type Preferences = z.infer<typeof Preferences>;

/** A change to some preferences. Unknown keys are refused. */
export const PreferencesChange = Preferences.partial().strict();
export type PreferencesChange = z.infer<typeof PreferencesChange>;

export const DEFAULT_PREFERENCES: Preferences = {
  furigana: "mixed",
  convertRomaji: true,
  explanations: "english",
  examMode: false,
  slowAudio: false,
  batchSize: 5,
};

/** The preferences after `change`. Throws when the change is not valid. */
export const changePreferences = (current: Preferences, change: unknown): Preferences => ({
  ...current,
  ...PreferencesChange.parse(change),
});
