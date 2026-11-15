import { checkWithinReach, type Authoring, type Failure } from "@ibbun/content-graph/authoring";
import type { Nlp } from "@ibbun/nlp";
import type { PracticeText, Progress, Texts } from "@ibbun/progress";
import { z } from "zod";
import { contextOf, passageUnit, questionFailures, questionLines, requestOfRun, sentenceLines, tokenise, type PassageUnit } from "../../src/passages.ts";

/** The Practice Text a request is for, as content-generation keeps it on the request's reason. */
const PracticeContext = z.object({ learnerId: z.string(), practiceTextId: z.string() });

/** A drafted Practice Text: its Reading Passage (prose or dialogue) and Sentences, with the Learner's choices. */
export type PracticeTextDraft = PassageUnit & { kind: "practice-text"; record: PracticeText };

export type PracticeTextCheck = { failures: Failure[] };

export const practiceTextDrafts = async (a: Authoring, texts: Texts, runId: string): Promise<PracticeTextDraft[]> => {
  const request = await requestOfRun(a, runId);
  const context = contextOf("practice-text ", PracticeContext, request.reason);
  const unit = context && (await passageUnit(a, request.targetId));
  const record = context && (await texts.practiceTexts(context.learnerId as PracticeText["learnerId"])).find((t) => t.id === context.practiceTextId);
  return unit && record ? [{ kind: "practice-text", ...unit, record }] : [];
};

/** Stores the tokens, then the checks a program can make (listening.md#content-rules): everything is within reach, and a dialogue's questions are well formed. */
export const checkPracticeText = async (a: Authoring, nlp: Nlp, progress: Progress, draft: PracticeTextDraft): Promise<PracticeTextCheck> => {
  const sentences = await tokenise(a, nlp, draft.lines);
  const known = new Set<string>(await progress.known(draft.record.learnerId));
  const questions = draft.passage.form === "dialogue" ? questionFailures(draft.passage.comprehensionQuestions) : [];
  return { failures: [...checkWithinReach(sentences, [], draft.record.level, known), ...questions] };
};

/** The values the rubric template needs. */
export const practiceTextValues = ({ record, passage, lines }: PracticeTextDraft): Record<string, string> => ({
  kind: record.form,
  level: record.level,
  textType: record.passageType,
  length: record.length,
  topic: record.topic ?? "none chosen",
  sentences: sentenceLines(lines),
  questions: passage.form === "dialogue" ? questionLines(passage.comprehensionQuestions) : "none: this is a passage",
});
