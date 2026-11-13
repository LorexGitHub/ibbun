import { z } from "zod";
import { StudyItemId } from "@ibbun/shared";

const Speaker = z.enum(["男", "女"]).nullable();

/** What the quiz step asks after the clip plays. Dictation shows only an input box. */
export const ClipQuestion = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dictation") }),
  z.object({ kind: z.literal("comprehension"), prompt: z.string(), choices: z.array(z.string()) }),
]);
export type ClipQuestion = z.infer<typeof ClipQuestion>;

/** A Listening Clip's lesson: Listen, Read, then Quiz (listening.md#learn). */
export const ClipLesson = z.object({
  studyItemId: StudyItemId,
  exampleId: z.string(),
  lines: z.array(z.object({ speaker: Speaker, text: z.string(), translationEn: z.string().nullable(), src: z.string() })).min(1),
  /** The Words and Grammar Points the clip's Sentences link to. */
  links: z.array(z.object({ studyItemId: StudyItemId, label: z.string() })),
  question: ClipQuestion,
  /** Exam Mode shapes the quiz step only; the lesson ignores it (listening.md#exam-mode). */
  examMode: z.boolean(),
  slowAudio: z.boolean(),
});
export type ClipLesson = z.infer<typeof ClipLesson>;

export const ClipAnswer = z.object({
  studyItemId: StudyItemId,
  exampleId: z.string(),
  /** Typed Japanese for dictation, the chosen option's text for comprehension. */
  input: z.string(),
  /** Tries before this one that were misses or not answers. */
  attempts: z.array(z.string()).default([]),
  replays: z.number().int().nonnegative().default(0),
  slow: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type ClipAnswer = z.input<typeof ClipAnswer>;

export const ClipVerdict = z.object({
  outcome: z.enum(["retry", "pass", "fail"]),
  /** The right option, to show after a miss on a comprehension question. */
  correctChoice: z.string().optional(),
});
export type ClipVerdict = z.infer<typeof ClipVerdict>;
