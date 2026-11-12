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

/** The Active Tracks and the size of a batch. Learn has no daily limit. */
export const State = z.object({
  activeTracks: z.array(Track),
  batchSize: z.number().int(),
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

/** `now` marks a Learn now session: its Reviews are recorded with `source: learn-now`. */
export const CompleteRequest = z.object({ answers: z.array(QuizAnswer).min(1), now: z.boolean().optional() });
export type CompleteRequest = z.input<typeof CompleteRequest>;
export const CompleteResponse = z.object({ recorded: z.number().int() });

export const SkipRequest = z.object({ studyItemId: StudyItemId, now: z.boolean().optional() });

/** The most Batch Texts a Learner gets in 24 h; past it a batch has none (batch-text.md#flow). */
export const BATCH_TEXT_LIMIT_24H = 5;
/** How long the end of Learn waits for an approved text before pointing to `reading`. */
export const BATCH_TEXT_WAIT_MS = 20_000;

/** The picked batch, sent when the Learner starts it. */
export const BatchTextRequest = z.object({ studyItemIds: z.array(StudyItemId).min(1) });
export type BatchTextRequest = z.infer<typeof BatchTextRequest>;
/** `enqueued` is false when the Learner hit the limit; the batch then has no Batch Text. */
export const BatchTextStart = z.object({ enqueued: z.boolean() });

/** A run of a Sentence. `reading` is set only where the Learner's furigana setting asks for it. */
export const Run = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  /** The Word a tap looks up; null for particles, punctuation and Words nobody linked. */
  wordId: StudyItemId.nullable(),
  /** `batch`: a Word of this batch. `earlier`: a Word the Learner met in an earlier batch. */
  highlight: z.enum(["batch", "earlier"]).nullable(),
});
export type Run = z.infer<typeof Run>;

export const SentenceView = z.object({ id: z.uuid(), runs: z.array(Run), translation: z.string().nullable() });
export type SentenceView = z.infer<typeof SentenceView>;

export const TextView = z.object({ title: z.string(), sentences: z.array(SentenceView) });
export type TextView = z.infer<typeof TextView>;

/** `GET /api/learn/batch-text`: the approved text of a batch, or that it is still being prepared. */
export const BatchTextStatus = z.discriminatedUnion("status", [
  z.object({ status: z.literal("preparing") }),
  z.object({ status: z.literal("ready"), text: TextView }),
]);
export type BatchTextStatus = z.infer<typeof BatchTextStatus>;

export const LookupRequest = z.object({ wordId: StudyItemId });
export const LookupView = z.object({ label: z.string(), reading: z.string().nullable(), meanings: z.array(z.string()) });
export type LookupView = z.infer<typeof LookupView>;
