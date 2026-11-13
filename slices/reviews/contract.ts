import { z } from "zod";
import { StudyItemId } from "@ibbun/shared";

/** What a Review asks for: a blanked span, a Kanji's reading in its Word, or a Kanji's meaning. */
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

export const Hint =z.enum(["hint", "translation", "explanation"]);
export type Hint = z.infer<typeof Hint>;

export const ReviewPrompt = z.object({
  studyItemId: StudyItemId,
  type: z.enum(["word", "grammar_point", "kanji"]),
  exampleId: z.string(),
  /** Cloze blanks `target`; Kanji highlights it. */
  mode: z.enum(["blank", "highlight"]),
  sentence: z.object({ before: z.string(), target: z.string(), after: z.string() }),
  translationEn: z.string().nullable(),
  japaneseExplanation: z.string().nullable(),
  hint: z.string().nullable(),
  facets: z.array(z.object({ facet: Facet, answerData: AnswerData })).min(1),
});
export type ReviewPrompt = z.infer<typeof ReviewPrompt>;

export const DueResponse = z.object({
  preferences: z.object({
    convertRomaji: z.boolean(),
    explanations: z.enum(["english", "japanese", "both"]),
  }),
  reviews: z.array(ReviewPrompt),
  /** When the soonest Review that is not due yet falls due. Only `/due` sends it. */
  nextDue: z.string().nullable().optional(),
});
export type DueResponse = z.infer<typeof DueResponse>;

/** Which Review this is: a scheduled one, a Wrap-Up re-ask, or a Ghost. Only `srs` feeds the Scheduler. */
export const AnswerKind = z.enum(["srs", "wrap-up", "ghost"]);
export type AnswerKind = z.infer<typeof AnswerKind>;

export const SubmitRequest = z.object({
  kind: AnswerKind.default("srs"),
  studyItemId: StudyItemId,
  exampleId: z.string(),
  /** `input` is the graded try; `attempts` are the earlier tries that were not answers or matched an alternate. */
  facets: z.array(z.object({ facet: Facet, input: z.string(), attempts: z.array(z.string()).default([]) })).min(1),
  hintsOpened: z.array(Hint).default([]),
  revealed: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type SubmitRequest = z.input<typeof SubmitRequest>;
export type Submission = z.output<typeof SubmitRequest>;

export const SubmitResponse = z.object({
  passed: z.boolean(),
  facets: z.array(
    z.object({ facet: Facet, outcome: z.enum(["pass", "fail"]), matchedAnswerId: z.string().optional(), message: z.string().optional() }),
  ),
});
export type SubmitResponse = z.infer<typeof SubmitResponse>;
