import { grade, type AnswerData, type GradeResult } from "@ibbun/content-graph/grade";
import type { QuizPrompt } from "../contract.ts";

export type PromptFacet = QuizPrompt["facets"][number];

export const SWITCH_TO_JAPANESE = "switch to Japanese input";
const FINISH_THE_KANA = "finish the kana first";
const TYPE_AN_ANSWER = "type an answer first";

/** English meanings are typed in Latin letters; every other facet is Japanese. */
export const isJapanese = (facet: PromptFacet) => facet.answerData.facet === "japanese";

/** What to tell a Learner whose try is not an answer: the nudge of an alternate, or why it was refused. */
const retryNote = (facet: PromptFacet, input: string, result: GradeResult, convertRomaji: boolean): string => {
  if (result.message) return result.message;
  if (isJapanese(facet) && /[a-z]/iu.test(input)) return convertRomaji ? FINISH_THE_KANA : SWITCH_TO_JAPANESE;
  return TYPE_AN_ANSWER;
};

/** Grades one facet the way the API will. `note` is set when the try is not an answer. */
export const tryFacet = (facet: PromptFacet, input: string, convertRomaji: boolean): { result: GradeResult; note?: string } => {
  const result = grade(facet.answerData as AnswerData, input);
  return result.outcome === "retry" ? { result, note: retryNote(facet, input, result, convertRomaji) } : { result };
};

/** The facets whose try was not an answer. When none is, the question can be checked. */
export const notAnswers = (facets: PromptFacet[], inputs: Record<string, string>, convertRomaji: boolean) =>
  facets.flatMap((facet) => {
    const { [facet.facet]: input = "" } = inputs;
    const { note } = tryFacet(facet, input, convertRomaji);
    return note === undefined ? [] : [{ facet: facet.facet, input, note }];
  });

/** Which of the Learner's toggles put the English translation and the Japanese Explanation on the question. */
export const shownByDefault = (explanations: "english" | "japanese" | "both") => ({
  translation: explanations !== "japanese",
  explanation: explanations !== "english",
});

/** The accepted answers, to show after a miss: a reading facet asks for the reading, so it shows that, not the written form. */
export const acceptedOf = (facet: PromptFacet): string[] =>
  facet.answerData.facet === "japanese"
    ? facet.answerData.accepted.map((a) => (facet.facet === "reading" && a.reading ? a.reading : a.written))
    : facet.answerData.meanings.map((m) => m.text);
