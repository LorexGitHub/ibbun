import type { Example, Kanji, StudyItemPage, Word } from "@mojibun/content-graph";
import type { AnswerData, QuizPrompt } from "../contract.ts";

export type TaughtType = QuizPrompt["type"];
export type TaughtPage = StudyItemPage & { item: { type: TaughtType } };
export type FacetData = QuizPrompt["facets"][number];

const TAUGHT = new Set<string>(["word", "grammar_point", "kanji"]);

/** Listening Clips are not taught here; every other Study Item is quizzed through an Example. */
export const isTaught = (page: StudyItemPage): page is TaughtPage => TAUGHT.has(page.item.type);

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

/** The facets a quiz question on this Study Item asks, each with the answer data `grade()` takes. */
export const facetsOf = ({ item }: TaughtPage, example: Example): FacetData[] =>
  item.type === "kanji"
    ? [
        { facet: "reading", answerData: japanese(example) },
        { facet: "meaning", answerData: meaning(item) },
      ]
    : [{ facet: "cloze", answerData: japanese(example) }];

/** The Japanese Explanation of what the Example shows: the Grammar Point, or the target Word sense. */
export const explanationOf = (item: StudyItemPage["item"], example: Example, words: Word[]): string | null => {
  if (item.type === "grammar_point") return item.japaneseExplanation;
  const senses = (item.type === "word" ? [item] : words).flatMap((w) => w.senses);
  const sense = senses.find((s) => s.id === example.targetSenseId) ?? (item.type === "word" ? senses[0] : undefined);
  return sense?.japaneseExplanation ?? null;
};

export const promptOf = (page: TaughtPage, example: Example, japaneseExplanation: string | null): QuizPrompt => {
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
    facets: facetsOf(page, example),
  };
};
