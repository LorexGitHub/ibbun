import { z } from "zod";
import { StudyItemId } from "@mojibun/shared";

/** The wire shapes of scheduled Listening Clip Reviews, shared by the web screens and the Hono routes. */

const Speaker = z.enum(["男", "女"]).nullable();

/** What the Learner is asked after hearing the clip. Dictation shows only an input box. */
export const Question = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dictation") }),
  z.object({ kind: z.literal("comprehension"), prompt: z.string(), choices: z.array(z.string()) }),
]);
export type Question = z.infer<typeof Question>;

/** A due clip as it is played: audio and the question, but never the text (listening.md#playback). */
export const ClipReview = z.object({
  clipId: StudyItemId,
  exampleId: z.string(),
  audio: z.array(z.object({ src: z.string(), speaker: Speaker })).min(1),
  question: Question,
  examMode: z.boolean(),
  slowAudio: z.boolean(),
});
export type ClipReview = z.infer<typeof ClipReview>;

export const ClipDueResponse = z.object({ clips: z.array(ClipReview) });
export type ClipDueResponse = z.infer<typeof ClipDueResponse>;

export const ClipAnswerRequest = z.object({
  clipId: StudyItemId,
  exampleId: z.string(),
  /** Typed Japanese for dictation, the chosen option's text for comprehension. */
  input: z.string(),
  /** Tries before this one that were not answers (empty input, Latin letters). */
  attempts: z.array(z.string()).default([]),
  replays: z.number().int().nonnegative().default(0),
  slow: z.boolean().default(false),
  /** "Show answer" counts as a fail. */
  revealed: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type ClipAnswerRequest = z.input<typeof ClipAnswerRequest>;

/** One Sudachi token of the Sentence, marked against what the Learner typed (listening.md#dictation-feedback). */
export const TokenDiff = z.object({
  surface: z.string(),
  reading: z.string(),
  status: z.enum(["correct", "wrong", "missing"]),
  /** What the Learner typed in this token's place, for `wrong`. */
  typed: z.string().optional(),
});
export type TokenDiff = z.infer<typeof TokenDiff>;

export const Transcript = z.array(
  z.object({ speaker: Speaker, text: z.string(), translation: z.string().nullable(), audio: z.string().nullable() }),
);
export type Transcript = z.infer<typeof Transcript>;

export const ClipAnswerResponse = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("retry") }),
  z.object({
    outcome: z.enum(["pass", "fail"]),
    transcript: Transcript,
    /** The right option, for a comprehension question. */
    correctChoice: z.string().optional(),
    /** Per-token feedback on a failed dictation. Grading stays all or nothing; this is feedback only. */
    diff: z.array(TokenDiff).optional(),
    /** Typed text after the last token, for a failed dictation. */
    extra: z.string().optional(),
  }),
]);
export type ClipAnswerResponse = z.infer<typeof ClipAnswerResponse>;
