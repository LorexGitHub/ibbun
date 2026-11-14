import type { SentenceLink, SentenceRecord } from "@ibbun/content-graph/authoring";
import type { Nlp, Token as NlpToken } from "@ibbun/nlp";

type Stored = SentenceRecord["tokens"][number];

/** Sudachi's tokens with the offsets and field names the Content Graph stores (so grading never calls NLP). */
export const toStoredTokens = (text: string, tokens: readonly NlpToken[]): Stored[] => {
  let cursor = 0;
  return tokens.map((t) => {
    const found = text.indexOf(t.surface, cursor);
    const start = found < 0 ? cursor : found;
    cursor = start + t.surface.length;
    return {
      surface: t.surface,
      reading: t.reading,
      lemma: t.lemma,
      partOfSpeech: [...t.partOfSpeech],
      conjugationForm: t.conjugation ? t.conjugation.form : null,
      start,
      end: cursor,
    };
  });
};

/** Particles, auxiliaries, symbols and blanks name no Word worth linking. */
const FUNCTION_WORDS = new Set(["助詞", "助動詞", "補助記号", "記号", "空白"]);

/** Links from Sudachi's tokens, for a Sentence `jpn_indices` does not cover: each content token to the Word of its lemma. */
export const sudachiLinks = (tokens: Stored[]): SentenceLink[] =>
  tokens
    .filter((t) => !FUNCTION_WORDS.has(t.partOfSpeech[0] ?? ""))
    .map((t) => ({ entry: null, form: t.lemma, reading: null, sense: null, start: t.start, end: t.end }));

/** Runs `work` over `items` with at most `limit` in flight, keeping the order of the results. */
export const mapLimited = async <T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await work(items[i]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

export const tokenize = async (nlp: Nlp, text: string): Promise<Stored[]> => toStoredTokens(text, await nlp.tokenize(text));
