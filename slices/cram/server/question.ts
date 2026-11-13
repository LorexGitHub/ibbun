import type { AnswerData, JapaneseAnswerData, MeaningAnswerData } from "@ibbun/content-graph/grade";
import type { Example, Kanji, StudyItem, StudyItemPage } from "@ibbun/content-graph";
import { CramType, type FacetName, type Question, type QuestionFacet } from "../contract.ts";

const japanese = (example: Example): JapaneseAnswerData => ({
  facet: "japanese",
  accepted: example.accepted,
  alternates: example.alternates,
  knownWrong: example.knownWrong,
});

const meaning = (kanji: Kanji): MeaningAnswerData => ({
  facet: "meaning",
  meanings: kanji.meanings.map((text, i) => ({ id: `meaning-${i}`, text })),
  knownWrong: kanji.knownWrongMeanings.map((wrong, i) => ({ id: `known-wrong-${i}`, ...wrong })),
});

/** What an Example asks of a Study Item (docs/review-answer-model.md#examples-for-every-study-item-type). */
export const facetsFor = (item: StudyItem, example: Example): QuestionFacet[] => {
  if (item.type === "kanji") {
    const reading: QuestionFacet = { facet: "japanese", label: "Reading in this Sentence", answerData: japanese(example) };
    return item.meanings.length ? [reading, { facet: "meaning", label: "Meaning", answerData: meaning(item) }] : [reading];
  }
  return [{ facet: "japanese", label: "The missing Japanese", answerData: japanese(example) }];
};

/** The answer data for each facet an Example asks, keyed by facet name. The API grades against this. */
export const answerDataFor = (item: StudyItem, example: Example): Map<FacetName, AnswerData> =>
  new Map(facetsFor(item, example).map((f) => [f.facet, f.answerData]));

/** The Example after `after` in the page's order, wrapping round; the first when `after` is not on the page. */
const nextExample = (examples: Example[], after?: string): Example | undefined =>
  examples[(examples.findIndex((e) => e.id === after) + 1) % examples.length];

/**
 * One question about a Study Item, from the Example after `after`. Null when the item cannot be
 * practised here: it is a Listening Clip, or it has no approved Example.
 */
export const questionFor = ({ item, examples }: StudyItemPage, after?: string): Question | null => {
  const type = CramType.safeParse(item.type);
  const example = nextExample(examples, after);
  if (!type.success || !example) return null;
  const { text, translationEn } = example.sentence;
  const { start, end } = example.target;
  return {
    studyItemId: item.id,
    exampleId: example.id,
    itemType: type.data,
    sentence: { before: text.slice(0, start), target: text.slice(start, end), after: text.slice(end), mode: item.type === "kanji" ? "highlight" : "blank" },
    translationEn,
    hint: example.hint,
    facets: facetsFor(item, example),
  };
};
