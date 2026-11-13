import type { Token as CoreToken } from "@ibbun/content-graph";
import type { Nlp } from "@ibbun/nlp";

/** Sudachi tokens carry no offsets, so each one starts where the previous ended. They concatenate to the text. */
export const withOffsets = (tokens: Awaited<ReturnType<Nlp["tokenize"]>>): CoreToken[] => {
  let start = 0;
  return tokens.map(({ surface, reading, lemma, partOfSpeech, conjugation }) => {
    const token = { surface, reading, lemma, partOfSpeech: [...partOfSpeech], conjugationForm: conjugation?.form ?? null, start, end: start + surface.length };
    start = token.end;
    return token;
  });
};
