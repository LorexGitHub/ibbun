import { compareLevels, type JlptLevel } from "@ibbun/shared";
import type { Token } from "../../schema.ts";

/** A current JLPT Level, or null for Unlevelled. */
export type Level = JlptLevel | null;

/** The Word a stored Sudachi token links to, with that Word's current level. */
export type LinkedWord = { id: string; level: Level };

/** A stored Sudachi token plus its JMdict Word link (null when nothing links). */
export type LinkedToken = Token & { word: LinkedWord | null };

/** A Grammar Point a Sentence demonstrates, with its current level. */
export type LinkedGrammar = { id: string; level: Level };

/** A drafted Sentence as the checks see it: stored tokens and links, no NLP calls. */
export type CheckedSentence = {
  text: string;
  translationEn: string | null;
  tokens: LinkedToken[];
  grammar: LinkedGrammar[];
};

/** One failed check, phrased so the generator can fix the draft on its next attempt. */
export type Failure = { check: string; message: string };

const NOT_CONTENT = new Set(["助詞", "助動詞", "補助記号", "記号", "空白", "接頭辞", "接尾辞"]);

/** Proper nouns and numbers: not expected in JMdict and never counted against a level. */
export const isUncounted = (token: Token): boolean =>
  token.partOfSpeech[1] === "固有名詞" || token.partOfSpeech[1] === "数詞";

/** A token that should link to a JMdict Word. */
export const isContent = (token: Token): boolean => {
  const [major = ""] = token.partOfSpeech;
  return !NOT_CONTENT.has(major) && !isUncounted(token);
};

/** True when `level` is at or below (as easy as, or easier than) `cap`. */
export const withinLevel = (level: JlptLevel, cap: JlptLevel): boolean => compareLevels(level, cap) <= 0;

export const fail = (check: string, message: string): Failure => ({ check, message });
