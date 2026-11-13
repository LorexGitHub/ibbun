import { grade, normalise, normaliseMeaning } from "@ibbun/content-graph/grade";
import type { Facet, Submission, SubmitResponse } from "../contract.ts";
import type { FacetData } from "./prompt.ts";

type Given = { facet: Facet; input: string; attempts: string[] };

export type FacetOutcome = {
  facet: Facet;
  rawInput: string;
  normalisedInput: string;
  outcome: "pass" | "fail";
  matchedAnswerId?: string;
  message?: string;
};

const normaliserOf = (facet: Facet) => (facet === "meaning" ? normaliseMeaning : normalise);

/** Whether the request answers exactly the facets this Review asks. */
export const coversFacets = (expected: FacetData[], given: Given[]) =>
  given.length === expected.length && expected.every((e) => given.some((g) => g.facet === e.facet));

/**
 * Grades every facet again from the stored answer data, so a forged pass is never stored.
 * Returns null when a facet's try is not an answer (and the answer was not revealed): that try is not graded.
 */
export const regrade = (expected: FacetData[], given: Given[], revealed: boolean): FacetOutcome[] | null => {
  const graded = expected.map(({ facet, answerData }) => {
    const { input } = given.find((g) => g.facet === facet)!;
    return { facet, input, result: grade(answerData, input) };
  });
  if (!revealed && graded.some((g) => g.result.outcome === "retry")) return null;
  return graded.map(({ facet, input, result }) => ({
    facet,
    rawInput: input,
    normalisedInput: normaliserOf(facet)(input),
    outcome: !revealed && result.outcome === "pass" ? "pass" : "fail",
    ...(result.matchedAnswerId && { matchedAnswerId: result.matchedAnswerId }),
    ...(result.message && { message: result.message }),
  }));
};

/** The fields of a Review that come from the request: what the Learner did besides answering. */
export const detailOf = (request: Submission) => ({
  attempts: request.facets.flatMap((f) => f.attempts.map((input) => ({ facet: f.facet, input }))),
  hintsOpened: request.hintsOpened,
  revealed: request.revealed,
  timeToAnswerMs: request.timeToAnswerMs,
});

export const responseOf = (results: FacetOutcome[]): SubmitResponse => ({
  passed: results.every((r) => r.outcome === "pass"),
  facets: results.map(({ facet, outcome, matchedAnswerId, message }) => ({ facet, outcome, matchedAnswerId, message })),
});

/** The per-facet fields `progress` stores. The message is shown, not stored. */
export const storedFacets = (results: FacetOutcome[]) => results.map(({ message: _, ...facet }) => facet);
