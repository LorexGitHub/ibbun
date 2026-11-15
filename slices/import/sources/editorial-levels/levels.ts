import type { JlptLevel } from "@ibbun/shared";

/** One supervisor decision: the JMdict entry, the level it should have, and why the lists get it wrong. */
export type EditorialLevel = { readonly jmdict: string; readonly word: string; readonly level: JlptLevel; readonly why: string };

/** Bump when the list changes, so the decisions get a Provenance of their own. */
export const VERSION = "1";

const NOT_IN_N5 = "taught in the first lessons of every N5 course; the JLPT lists leave set phrases out of N5";
const LEMMA = "Sudachi lemmatises the N5 form to this entry";

/**
 * Levels the imported JLPT lists get wrong for words every course teaches early (#302). An Editorial candidate
 * outranks a List one (docs/jlpt-levels.md), so these win over Tanos and the yomitan lists.
 */
export const EDITORIAL_LEVELS: readonly EditorialLevel[] = [
  { jmdict: "1586820", word: "ありがとう", level: "N5", why: NOT_IN_N5 },
  { jmdict: "1289400", word: "こんにちは", level: "N5", why: NOT_IN_N5 },
  { jmdict: "1002340", word: "おはようございます", level: "N5", why: NOT_IN_N5 },
  { jmdict: "1224890", word: "よろしく", level: "N5", why: NOT_IN_N5 },
  { jmdict: "1430610", word: "すぐ", level: "N5", why: "the lists rate it N1; it is basic N5 vocabulary" },
  { jmdict: "1315840", word: "時 (とき)", level: "N5", why: "the lists rate it N3; 〜とき is N5 grammar" },
  { jmdict: "2020680", word: "時 (じ, o'clock)", level: "N5", why: "telling the time is N5; the lists have no level for the counter" },
  { jmdict: "1463770", word: "日 (ひ)", level: "N5", why: "the lists rate it N4; it is basic N5 vocabulary" },
  { jmdict: "2083100", word: "日 (にち)", level: "N5", why: "the lists rate it N3; dates are N5" },
  { jmdict: "1184280", word: "くださる", level: "N5", why: `ください is N5; ${LEMMA}` },
  { jmdict: "1270350", word: "ござる", level: "N5", why: `ございます is N5; ${LEMMA}` },
  { jmdict: "1217950", word: "願う", level: "N5", why: `お願いします is N5; ${LEMMA}` },
  { jmdict: "1002570", word: "お疲れさま", level: "N4", why: "the lists have no level for it; it is everyday workplace Japanese at N4" },
  { jmdict: "1132620", word: "メール", level: "N4", why: "the lists have no level for it" },
  { jmdict: "1322670", word: "社員", level: "N4", why: "the lists have no level for it" },
  { jmdict: "1628260", word: "いただける", level: "N4", why: "いただく is N4; the lists have no level for its potential" },
  { jmdict: "1217700", word: "頑張る", level: "N4", why: "the lists have no level for it" },
  { jmdict: "1002420", word: "お知らせ", level: "N4", why: "知らせる is N4; the lists have no level for the noun" },
];
