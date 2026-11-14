import type { ReadingPassage, Token } from "@ibbun/content-graph";
import { showsFurigana, type FuriganaSetting, type Mastery } from "@ibbun/progress";
import type { StudyItemId } from "@ibbun/shared";
import type { Run, SentenceView, TextView } from "../contract.ts";

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
  return { text: token.surface, reading: furigana ? hiragana(token.reading) : null, wordId, inBatch: wordId !== null && reader.batch.has(wordId) };
};

/** Text before, between and after the tokens (Sudachi drops nothing, but a Sentence may have no tokens). */
const runsOf = (reader: Reader, sentence: Sentence): Run[] =>
  sentence.tokens.length === 0
    ? [{ text: sentence.text, reading: null, wordId: null, inBatch: false }]
    : sentence.tokens.map((token) => runOf(reader, sentence, token));

const sentenceView = (reader: Reader, sentence: Sentence): SentenceView => ({
  id: sentence.id,
  runs: runsOf(reader, sentence),
  translation: sentence.translationEn,
});

/** Only credits whose licence asks for one beside the content; the rest go on the Credits page. */
const creditsOf = (passage: ReadingPassage) =>
  passage.attribution
    .filter((c) => c.inline)
    .map((c) => ({ text: [c.author, c.dataset ?? c.licenceName].filter(Boolean).join(" · "), ...(c.url ? { href: c.url } : {}) }));

export const textView = (passage: ReadingPassage, reader: Reader, episode: TextView["episode"]): TextView => ({
  title: passage.title,
  episode,
  sentences: passage.sentences.map((s) => sentenceView(reader, s)),
  credits: creditsOf(passage),
});
