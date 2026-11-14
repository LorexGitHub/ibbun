import type { Progress } from "@ibbun/progress";
import type { LearnerId } from "@ibbun/shared";
import type { CheckedAnswer } from "../contract.ts";
import { facetsOf } from "./prompt.ts";
import { coversFacets, regrade, type FacetOutcome } from "./regrade.ts";
import type { Teacher } from "./teach.ts";

export type Graded = { answer: CheckedAnswer; results: FacetOutcome[] };
export type Refusal = { status: 400 | 404 | 422; message: string };

const refuse = (status: Refusal["status"], message: string): { refusal: Refusal } => ({ refusal: { status, message } });

const gradeOne = async (locate: Teacher["locate"], answer: CheckedAnswer): Promise<{ graded: Graded } | { refusal: Refusal }> => {
  const found = await locate(answer.studyItemId, answer.exampleId);
  if (!found) return refuse(404, "no such quiz question");
  const expected = facetsOf(found.page, found.example);
  if (!coversFacets(expected, answer.facets)) return refuse(422, "answer every facet of the question");
  const results = regrade(expected, answer.facets);
  if (!results?.every((r) => r.outcome === "pass")) return refuse(422, "the quiz is not fully correct yet");
  return { graded: { answer, results } };
};

/** Grades every answer again from the stored answer data. Refuses all of them when one is not right. */
export const gradeQuiz = async (locate: Teacher["locate"], answers: CheckedAnswer[]): Promise<{ graded: Graded[] } | { refusal: Refusal }> => {
  const graded: Graded[] = [];
  for (const answer of answers) {
    const one = await gradeOne(locate, answer);
    if ("refusal" in one) return one;
    graded.push(one.graded);
  }
  return { graded };
};

/** Appends one `learn` Review per answer: this is what puts the items into Reviews. `learnNow` marks the Reviews as Learn now. */
export const recordQuiz = async (progress: Progress, learnerId: LearnerId, graded: Graded[], at: Date, learnNow = false) => {
  for (const { answer, results } of graded) {
    await progress.record({
      learnerId,
      studyItemId: answer.studyItemId,
      kind: "learn",
      passed: true,
      at: at.toISOString(),
      exampleId: answer.exampleId,
      facets: results,
      attempts: answer.facets.flatMap((f) => f.attempts.map((input) => ({ facet: f.facet, input }))),
      timeToAnswerMs: answer.timeToAnswerMs,
      source: learnNow ? "learn-now" : undefined,
    });
  }
};
