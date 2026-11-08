import { z } from "zod";
import { JLPT_LEVELS, StudyItemId } from "@mojibun/shared";
import { ClipLesson } from "./listening/contract.ts";

/** One Study Item type at one level, as the Active Track grid shows it. Listening Clips are taught in `listening/`, not through this grid. */
export const Track = z.object({
  level: z.enum([...JLPT_LEVELS, "unlevelled"]),
  type: z.enum(["kanji", "word", "grammar_point"]),
});
export type Track = z.infer<typeof Track>;

export const TrackChange = z.object({ tracks: z.array(Track) });

/** The Active Tracks and what is left of today's budget for New Study Items. */
export const State = z.object({
  activeTracks: z.array(Track),
  batchSize: z.number().int(),
  dailyBudget: z.number().int(),
  learnedToday: z.number().int(),
});
export type State = z.infer<typeof State>;

/** What a lesson teaches about one Study Item, whatever its type. */
export const Lesson = z.object({
  studyItemId: StudyItemId,
  type: z.enum(["kanji", "word", "grammar_point"]),
  title: z.string(),
  reading: z.string().nullable(),
  meanings: z.array(z.string()),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
  japaneseExplanation: z.string().nullable(),
  example: z.object({ japanese: z.string(), translationEn: z.string().nullable() }),
});
export type Lesson = z.infer<typeof Lesson>;

/** What a quiz question asks for: a blanked span, a Kanji's reading in its Word, or a Kanji's meaning. */
export const Facet = z.enum(["cloze", "reading", "meaning"]);
export type Facet = z.infer<typeof Facet>;

const Answer = z.object({
  id: z.string(),
  written: z.string(),
  reading: z.string().nullish(),
  message: z.string().nullish(),
});

/** The answer data `grade()` takes, so the web client can grade as the Learner types. */
export const AnswerData = z.discriminatedUnion("facet", [
  z.object({ facet: z.literal("japanese"), accepted: z.array(Answer), alternates: z.array(Answer), knownWrong: z.array(Answer) }),
  z.object({
    facet: z.literal("meaning"),
    meanings: z.array(z.object({ id: z.string(), text: z.string() })),
    knownWrong: z.array(z.object({ id: z.string(), answer: z.string(), explanation: z.string() })),
  }),
]);
export type AnswerData = z.infer<typeof AnswerData>;

export const QuizPrompt = z.object({
  studyItemId: StudyItemId,
  type: z.enum(["word", "grammar_point", "kanji"]),
  exampleId: z.string(),
  /** Cloze blanks `target`; Kanji highlights it. */
  mode: z.enum(["blank", "highlight"]),
  sentence: z.object({ before: z.string(), target: z.string(), after: z.string() }),
  translationEn: z.string().nullable(),
  japaneseExplanation: z.string().nullable(),
  facets: z.array(z.object({ facet: Facet, answerData: AnswerData })).min(1),
});
export type QuizPrompt = z.infer<typeof QuizPrompt>;

export const Batch = z.object({
  preferences: z.object({
    convertRomaji: z.boolean(),
    explanations: z.enum(["english", "japanese", "both"]),
  }),
  /** New Study Items today's budget still allows; 0 explains an empty batch. */
  remaining: z.number().int(),
  /** A Listening Clip is taught whole, quiz included (`clip`); every other item has a lesson and a question in the batch quiz. */
  items: z.array(z.union([z.object({ lesson: Lesson, prompt: QuizPrompt }), z.object({ clip: ClipLesson })])),
});
export type Batch = z.infer<typeof Batch>;
export type BatchItem = Batch["items"][number];

/** The Learner's last, correct answer to one quiz question, with the tries before it that missed. */
export const QuizAnswer = z.object({
  studyItemId: StudyItemId,
  exampleId: z.string(),
  facets: z.array(z.object({ facet: Facet, input: z.string(), attempts: z.array(z.string()).default([]) })).min(1),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type QuizAnswer = z.input<typeof QuizAnswer>;
/** A quiz answer after parsing: every facet has its `attempts`. */
export type CheckedAnswer = z.output<typeof QuizAnswer>;

export const CompleteRequest = z.object({ answers: z.array(QuizAnswer).min(1) });
export type CompleteRequest = z.input<typeof CompleteRequest>;
export const CompleteResponse = z.object({ recorded: z.number().int() });

export const SkipRequest = z.object({ studyItemId: StudyItemId });
