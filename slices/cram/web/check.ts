import { grade, type AnswerData } from "@ibbun/content-graph/grade";
import type { FacetName, FacetOutcome, QuestionFacet } from "../contract.ts";

export type Inputs = Partial<Record<FacetName, string>>;

/** The instant feedback the Learner gets before anything is sent. The API grades again with the same `grade()`. */
export const checkLocally = (facets: QuestionFacet[], inputs: Inputs): FacetOutcome[] =>
  facets.map(({ facet, answerData }) => ({ facet, ...grade(answerData, (inputs[facet] ?? "") as never) }));

/** What to tell a Learner whose input was not graded: an alternate's nudge, or why the input is not an answer. */
export const retryMessage = (results: FacetOutcome[]): string | null => {
  const retry = results.find((r) => r.outcome === "retry");
  return retry ? (retry.message ?? "Type your answer in Japanese, or in English for a meaning.") : null;
};

/** The answer Show answer reveals for a facet. */
export const revealedAnswer = (answerData: AnswerData): string => {
  if (answerData.facet === "japanese") return answerData.accepted[0]?.written ?? "";
  if (answerData.facet === "meaning") return answerData.meanings.map((m) => m.text).join(", ");
  return "";
};
