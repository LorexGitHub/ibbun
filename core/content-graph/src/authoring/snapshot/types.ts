import type { JlptLevel } from "@mojibun/shared";
import type { Licence, Token } from "../../schema.ts";

/** One JMdict entry, keyed by `ent_seq`. Forms and readings in upstream order. */
export type WordRecord = {
  key: string;
  forms: string[];
  readings: { text: string; pitchAccent: number[] | null }[];
  senses: { partsOfSpeech: string[]; glosses: string[] }[];
  priorityTags: string[];
};

/** One KANJIDIC2 character, keyed by its literal. */
export type KanjiRecord = {
  key: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  grade: number | null;
  frequency: number | null;
  strokeCount: number;
  components: string[];
  strokes: string[];
};

/**
 * KanjiVG stroke data for one character, keyed by its code point as KanjiVG writes it (five lowercase hex digits, `098df`).
 * `strokes` are the SVG path `d` strings in stroke order. They land on the KANJIDIC2 Kanji of the same character.
 */
export type KanjiStrokesRecord = { key: string; strokes: string[] };

/**
 * One Sentence-uses-Word link as the source states it: a JMdict `entry` when it knows one (`jpn_indices`), else the
 * dictionary `form` and `reading`. `sense` is the 1-based sense number, when known. Resolved to a Word when applied.
 */
export type SentenceLink = { entry: string | null; form: string; reading: string | null; sense: number | null; start: number; end: number };

/** One Tatoeba Sentence, keyed by sentence id, with the translation the fixed rule chose and its rebuilt tokens. */
export type SentenceRecord = {
  key: string;
  text: string;
  translationEn: string;
  tokens: Token[];
  /** Sentence-uses-Word links; the source has already chosen between `jpn_indices` and Sudachi. */
  links?: SentenceLink[];
  author: string | null;
  licence: Extract<Licence, "cc-by-2.0-fr" | "cc0">;
};

/**
 * The List level the Tanos kanji lists give one Kanji, keyed by its literal. A Kanji listed at several levels has
 * already been reduced to its easiest by the parser (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists).
 */
export type KanjiLevelRecord = { key: string; level: JlptLevel };

/**
 * One ja Wiktionary gloss, keyed by page title, entry number and gloss number on that page. `title` is the headword page
 * (a kanji spelling, or a kana spelling when the Word has no kanji form); the rule finds the JLPT Word it belongs to.
 */
export type WiktionaryRecord = { key: string; title: string; text: string };

/**
 * The List level yomitan-jlpt-vocab gives one JMdict Word, keyed by `ent_seq`. A Word listed at several levels has
 * already been reduced to its easiest by the parser (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists).
 */
export type WordLevelRecord = { key: string; level: JlptLevel };

/**
 * UniDic's accent for one dictionary-form lexeme: `form` is its orthographic base and `reading` its kana base in hiragana, keyed
 * `form\treading`. `pitchAccent` is the `aType` values, the more common first; 0 is heiban. The rule lands them on the JMdict
 * reading that has this form and reading. A Word UniDic splits into several tokens has no lexeme, so it gets none.
 */
export type UnidicRecord = { key: string; form: string; reading: string; pitchAccent: number[] };

export type Records = {
  jmdict: WordRecord;
  kanjidic: KanjiRecord;
  kanjivg: KanjiStrokesRecord;
  tatoeba: SentenceRecord;
  tanos: KanjiLevelRecord;
  yomitan: WordLevelRecord;
  "wiktionary-ja": WiktionaryRecord;
  unidic: UnidicRecord;
};
export type Dataset = keyof Records;

export type Run = { upstreamVersion: string; checksum: string };

/** Circuit breaker thresholds (import-pipeline.md#circuit-breaker). Config values, not code. */
export type Breaker = {
  /** Share of a dataset's records a run may retire or change. */
  maxChangedShare: number;
  maxExamplesRedrafted: number;
  maxLevelChanges: number;
};

export const DEFAULT_BREAKER: Breaker = { maxChangedShare: 0.005, maxExamplesRedrafted: 50, maxLevelChanges: 100 };

export type SnapshotOptions = {
  breaker?: Breaker;
  /** The supervisor released a tripped run: apply it despite the breaker. */
  release?: boolean;
  /** Closest-similarity floor for matching a changed sense. */
  senseThreshold?: number;
};

export const COUNT_KEYS = [
  "added",
  "changed",
  "retired",
  "superseded",
  "staleOverrides",
  "orphanedOverrides",
  "examplesRedrafted",
  "approvedExamplesRedrafted",
  "unmatchedSenses",
  "suspended",
  "levelsChanged",
  "retiredLevelledWithoutSuccessor",
] as const;
export type Counts = Record<(typeof COUNT_KEYS)[number], number>;

/** What an Import Run report needs. `unchanged` means this upstream version was already applied. */
export type SnapshotReport = {
  importRunId: string;
  status: "applied" | "breaker tripped" | "unchanged";
  counts: Counts;
  tripped: string[];
  /** Records the run skipped, one line each: for tanos, every Kanji that is not in KANJIDIC2; for yomitan, every `ent_seq` that is not a JMdict Word. */
  notes?: string[];
};
