import { headword, type ContentGraph, type ReadingPassage, type Token, type Word } from "@ibbun/content-graph";
import { showsFurigana, type FuriganaSetting, type Mastery } from "@ibbun/progress";
import { JLPT_LEVELS, type StudyItemId } from "@ibbun/shared";
import type { LookupView, Run, SentenceView, TextView } from "../contract.ts";

const HAS_KANJI = /[㐀-鿿々]/u;

/** Sudachi readings are katakana; furigana is hiragana. */
const hiragana = (katakana: string) => katakana.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export type Reader = {
  furigana: FuriganaSetting;
  /** Mastery of a Word for this Learner; a Word with no Reviews is New. */
  mastery: (wordId: StudyItemId) => Mastery;
  batch: ReadonlySet<StudyItemId>;
};

type Sentence = ReadingPassage["sentences"][number];

const wordAt = (sentence: Sentence, token: Token) => sentence.words.find((w) => w.start <= token.start && token.end <= w.end)?.wordId ?? null;

const runOf = (reader: Reader, sentence: Sentence, token: Token): Run => {
  const wordId = wordAt(sentence, token);
  const mastery = wordId ? reader.mastery(wordId) : "new";
  const furigana = HAS_KANJI.test(token.surface) && showsFurigana(reader.furigana, { mastery });
  const highlight = wordId === null ? null : reader.batch.has(wordId) ? "batch" : mastery === "new" ? null : "earlier";
  return { text: token.surface, reading: furigana ? hiragana(token.reading) : null, wordId, highlight };
};

const sentenceView = (reader: Reader, sentence: Sentence): SentenceView => ({
  id: sentence.id,
  runs:
    sentence.tokens.length === 0
      ? [{ text: sentence.text, reading: null, wordId: null, highlight: null }]
      : sentence.tokens.map((token) => runOf(reader, sentence, token)),
  translation: sentence.translationEn,
});

export const textView = (passage: ReadingPassage, reader: Reader): TextView => ({
  title: passage.title,
  sentences: passage.sentences.map((s) => sentenceView(reader, s)),
});

export const lookupView = (word: Word): LookupView => ({
  label: headword(word),
  reading: word.readings[0]?.text ?? null,
  meanings: word.senses.flatMap((s) => s.glosses).slice(0, 4),
});

/** The batch's level is its hardest item's, an Unlevelled item counting as hardest (batch-text.md). */
export const batchLevel = async (graph: ContentGraph, ids: readonly StudyItemId[]) => {
  const levels = await Promise.all(ids.map(async (id) => (await graph.studyItem(id))?.item.level ?? null));
  if (levels.includes(null)) return "unlevelled" as const;
  return JLPT_LEVELS[Math.max(...levels.map((l) => JLPT_LEVELS.indexOf(l!)))] ?? "unlevelled";
};

export const sameItems = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set([...a, ...b]).size === a.length;
