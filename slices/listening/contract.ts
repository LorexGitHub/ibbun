import { z } from "zod";
import { JlptLevel } from "@mojibun/shared";

/** The wire shapes of the listening slice, shared by the web screens and the Hono routes. */

export const ClipList = z.object({ level: JlptLevel, clipIds: z.array(z.string()) });
export type ClipList = z.infer<typeof ClipList>;

/** What the Learner is asked after hearing the clip. Dictation shows only an input box. */
export const Question = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dictation") }),
  z.object({ kind: z.literal("comprehension"), prompt: z.string(), choices: z.array(z.string()) }),
]);
export type Question = z.infer<typeof Question>;

const Speaker = z.enum(["男", "女"]).nullable();

/** A clip as it is played: audio and the question, but never the text (listening.md#playback). */
export const ClipView = z.object({
  clipId: z.string(),
  exampleId: z.string(),
  audio: z.array(z.object({ src: z.string(), speaker: Speaker })).min(1),
  question: Question,
  examMode: z.boolean(),
  slowAudio: z.boolean(),
});
export type ClipView = z.infer<typeof ClipView>;

export const AnswerRequest = z.object({
  exampleId: z.string(),
  /** Typed Japanese for dictation, the chosen option's text for comprehension. */
  input: z.string(),
  /** Tries the Learner made before this one that were not answers (empty input, Latin letters). */
  attempts: z.array(z.string()).default([]),
  replays: z.number().int().nonnegative().default(0),
  slow: z.boolean().default(false),
  /** "Show answer" counts as a fail. */
  revealed: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type AnswerRequest = z.input<typeof AnswerRequest>;

/** What shows once the Learner has answered. */
export const Transcript = z.array(
  z.object({ speaker: Speaker, text: z.string(), translation: z.string().nullable(), audio: z.string().nullable() }),
);
export type Transcript = z.infer<typeof Transcript>;

export const AnswerResponse = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("retry") }),
  z.object({
    outcome: z.enum(["pass", "fail"]),
    transcript: Transcript,
    /** The right option, for a comprehension question. */
    correctChoice: z.string().optional(),
  }),
]);
export type AnswerResponse = z.infer<typeof AnswerResponse>;
