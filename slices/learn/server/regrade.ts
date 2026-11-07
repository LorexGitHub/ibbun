import { grade, normalise, normaliseMeaning } from "@mojibun/content-graph/grade";
import type { Facet } from "../contract.ts";
import type { FacetData } from "./prompt.ts";

type Given = { facet: Facet; input: string };

export type FacetOutcome = {
  facet: Facet;
  rawInput: string;
  normalisedInput: string;
  outcome: "pass" | "fail";
  matchedAnswerId?: string;
};

const normaliserOf = (facet: Facet) => (facet === "meaning" ? normaliseMeaning : normalise);

/** Whether the request answers exactly the facets this question asks. */
export const coversFacets = (expected: FacetData[], given: Given[]) =>
  given.length === expected.length && expected.every((e) => given.some((g) => g.facet === e.facet));

/**
 * Grades every facet again from the stored answer data, so a forged pass is never stored.
 * Returns null when a facet's try is not an answer: the quiz asks again before it is submitted.
 */
export const regrade = (expected: FacetData[], given: Given[]): FacetOutcome[] | null => {
  const graded = expected.map(({ facet, answerData }) => {
    const { input } = given.find((g) => g.facet === facet)!;
    return { facet, input, result: grade(answerData, input) };
  });
  if (graded.some((g) => g.result.outcome === "retry")) return null;
  return graded.map(({ facet, input, result }) => ({
    facet,
    rawInput: input,
    normalisedInput: normaliserOf(facet)(input),
    outcome: result.outcome === "pass" ? "pass" : "fail",
    ...(result.matchedAnswerId && { matchedAnswerId: result.matchedAnswerId }),
  }));
};
