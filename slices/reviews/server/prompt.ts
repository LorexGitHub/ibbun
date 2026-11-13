import type { Example, Kanji, StudyItemPage, Word } from "@ibbun/content-graph";
import type { AnswerData, ReviewPrompt } from "../contract.ts";

export type ReviewableType = ReviewPrompt["type"];
export type FacetData = ReviewPrompt["facets"][number];

const REVIEWABLE = new Set<string>(["word", "grammar_point", "kanji"]);

/** Listening Clips are not in this slice; every other Study Item is reviewed through an Example. */
export const isReviewable = (page: StudyItemPage): page is StudyItemPage & { item: { type: ReviewableType } } =>
  REVIEWABLE.has(page.item.type);

/** Each Review rotates to a different approved Example: the one after the last used, wrapping round. */
export const pickExample = (examples: Example[], lastExampleId: string | undefined): Example | undefined => {
  const last = examples.findIndex((e) => e.id === lastExampleId);
  return examples[(last + 1) % examples.length];
};

const japanese = (example: Example): AnswerData => ({
  facet: "japanese",
  accepted: example.accepted,
  alternates: example.alternates,
  knownWrong: example.knownWrong,
});

const meaning = (kanji: Kanji): AnswerData => ({
  facet: "meaning",
  meanings: kanji.meanings.map((text, i) => ({ id: `meaning-${i}`, text })),
  knownWrong: kanji.knownWrongMeanings.map((w, i) => ({ id: `known-wrong-${i}`, ...w })),
});

/** The facets a Review of this Study Item asks, each with the answer data `grade()` takes. */
export const facetsOf = (page: StudyItemPage & { item: { type: ReviewableType } }, example: Example): FacetData[] => {
  const { item } = page;
  if (item.type === "kanji") {
    return [
      { facet: "reading", answerData: japanese(example) },
      { facet: "meaning", answerData: meaning(item) },
    ];
  }
  return [{ facet: "cloze", answerData: japanese(example) }];
};

/** The Japanese Explanation of what the Example shows: the Grammar Point, or the target Word sense. */
export const explanationOf = (item: StudyItemPage["item"], example: Example, words: Word[]): string | null => {
  if (item.type === "grammar_point") return item.japaneseExplanation;
  const senses = (item.type === "word" ? [item] : words).flatMap((w) => w.senses);
  const sense = senses.find((s) => s.id === example.targetSenseId) ?? (item.type === "word" ? senses[0] : undefined);
  return sense?.japaneseExplanation ?? null;
};

export const promptOf = (
  page: StudyItemPage & { item: { type: ReviewableType } },
  example: Example,
  japaneseExplanation: string | null,
): ReviewPrompt => {
  const { text } = example.sentence;
  const { start, end } = example.target;
  return {
    studyItemId: page.item.id,
    type: page.item.type,
    exampleId: example.id,
    mode: page.item.type === "kanji" ? "highlight" : "blank",
    sentence: { before: text.slice(0, start), target: text.slice(start, end), after: text.slice(end) },
    translationEn: example.sentence.translationEn,
    japaneseExplanation,
    hint: example.hint,
    facets: facetsOf(page, example),
  };
};
