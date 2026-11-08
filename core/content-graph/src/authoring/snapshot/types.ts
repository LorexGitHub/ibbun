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

/** One Tatoeba Sentence, keyed by sentence id, with the translation the fixed rule chose and its rebuilt tokens. */
export type SentenceRecord = {
  key: string;
  text: string;
  translationEn: string;
  tokens: Token[];
  author: string | null;
  licence: Extract<Licence, "cc-by-2.0-fr" | "cc0">;
};

/**
 * The List level the Tanos kanji lists give one Kanji, keyed by its literal. A Kanji listed at several levels has
 * already been reduced to its easiest by the parser (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists).
 */
export type KanjiLevelRecord = { key: string; level: JlptLevel };

export type Records = { jmdict: WordRecord; kanjidic: KanjiRecord; tatoeba: SentenceRecord; tanos: KanjiLevelRecord };
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
  /** Records the run skipped, one line each: for tanos, every Kanji that is not in KANJIDIC2. */
  notes?: string[];
};
