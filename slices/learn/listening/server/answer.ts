import { normalise } from "@ibbun/content-graph";
import type { Progress } from "@ibbun/progress";
import type { LearnerId } from "@ibbun/shared";
import type { z } from "zod";
import type { ClipAnswer, ClipVerdict } from "../contract.ts";
import { gradingOf, type ClipTeacher } from "./clip-teach.ts";

type Checked = z.output<typeof ClipAnswer>;

/**
 * Grades a quiz try on the server. A pass appends one `learn` Review, which puts the clip into Reviews; a miss
 * or a try that is not an answer stores nothing, and the client asks again on a fresh play.
 * Returns null when no such quiz question exists.
 */
export const answerClip = async (
  deps: { clips: ClipTeacher; progress: Progress; examMode: boolean; now: Date },
  learnerId: LearnerId,
  answer: Checked,
): Promise<ClipVerdict | null> => {
  const example = await deps.clips.locate(answer.studyItemId, answer.exampleId);
  if (!example) return null;
  const { facet, run, correctChoice } = gradingOf(example);
  const { outcome } = run(answer.input);
  if (outcome === "retry") return { outcome };
  if (outcome === "fail") return { outcome, ...(correctChoice && { correctChoice }) };
  await deps.progress.record({
    learnerId,
    studyItemId: answer.studyItemId,
    kind: "learn",
    passed: true,
    at: deps.now.toISOString(),
    exampleId: example.id,
    facets: [{ facet, rawInput: answer.input, normalisedInput: normalise(answer.input), outcome: "pass" }],
    attempts: answer.attempts.map((input) => ({ facet, input })),
    timeToAnswerMs: answer.timeToAnswerMs,
    // The quiz plays once in Exam Mode: no replay and no slow speed.
    listening: { replays: deps.examMode ? 0 : answer.replays, slow: !deps.examMode && answer.slow, examMode: deps.examMode },
  });
  return { outcome };
};
