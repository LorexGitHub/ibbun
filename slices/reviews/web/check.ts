import { grade, type AnswerData, type GradeResult } from "@ibbun/content-graph/grade";
import type { ReviewPrompt } from "../contract.ts";

export type PromptFacet = ReviewPrompt["facets"][number];

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

/** Grades one facet the way the API will, so the Learner gets instant feedback. `note` is set when the try is not graded. */
export const tryFacet = (facet: PromptFacet, input: string, convertRomaji: boolean): { result: GradeResult; note?: string } => {
  const result = grade(facet.answerData as AnswerData, input);
  return result.outcome === "retry" ? { result, note: retryNote(facet, input, result, convertRomaji) } : { result };
};

/** The facets whose try was not an answer. When none is, the whole Review can be submitted. */
export const notAnswers = (facets: PromptFacet[], inputs: Record<string, string>, convertRomaji: boolean) =>
  facets.flatMap((facet) => {
    const input = inputs[facet.facet] ?? "";
    const { note } = tryFacet(facet, input, convertRomaji);
    return note === undefined ? [] : [{ facet: facet.facet, input, note }];
  });

/** Which of the Learner's toggles put the English translation and the Japanese Explanation on the prompt. */
export const shownByDefault = (explanations: "english" | "japanese" | "both") => ({
  translation: explanations !== "japanese",
  explanation: explanations !== "english",
});

/** The accepted written forms, to show once the answer is revealed. */
export const acceptedOf = (facet: PromptFacet): string[] =>
  facet.answerData.facet === "japanese"
    ? facet.answerData.accepted.map((a) => a.written)
    : facet.answerData.meanings.map((m) => m.text);
