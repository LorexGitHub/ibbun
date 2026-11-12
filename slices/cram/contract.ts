import { z } from "zod";
import { JlptLevel, StudyItemId } from "@mojibun/shared";
import type { StudyItemSummary } from "@mojibun/content-graph";
import type { AnswerData } from "@mojibun/content-graph/grade";

/** The Study Item types Cram practises through Examples. Listening Clips are practised in the `listening` slice. */
export const CramType = z.enum(["kanji", "word", "grammar_point"]);
export type CramType = z.infer<typeof CramType>;

/** Where the Learner stands with a Study Item. One they have not been taught is New. */
export const CramMastery = z.enum(["new", "learning", "young", "mature", "relearning"]);
export type CramMastery = z.infer<typeof CramMastery>;

/** A Study Item in the picker's list, with the Learner's Mastery of it. */
export type CramItem = StudyItemSummary & { mastery: CramMastery };

/** `GET /items`: either a search, or a level, optionally narrowed to one type or one Mastery. Locked items are listed too. */
export const ItemQuery = z
  .object({ q: z.string().trim().min(1).optional(), level: JlptLevel.optional(), type: CramType.optional(), mastery: CramMastery.optional() })
  .refine((query) => query.q || query.level, { message: "give q or level" });
export type ItemQuery = z.infer<typeof ItemQuery>;

export const FacetName = z.enum(["japanese", "meaning"]);
export type FacetName = z.infer<typeof FacetName>;

/** One thing the Learner is asked: the answer data lets the web client give instant feedback; the API grades again. */
export type QuestionFacet = { facet: FacetName; label: string; answerData: AnswerData };

export type Question = {
  studyItemId: string;
  exampleId: string;
  itemType: CramType;
  /** The Sentence cut at the Example's target. A Kanji's target is highlighted, any other is blanked. */
  sentence: { before: string; target: string; after: string; mode: "blank" | "highlight" };
  translationEn: string | null;
  hint: string | null;
  facets: QuestionFacet[];
};

/** `POST /answers`: what the Learner typed, once per facet, plus what they did on the way. */
export const Submission = z.object({
  studyItemId: StudyItemId,
  exampleId: z.string().min(1),
  facets: z.array(z.object({ facet: FacetName, input: z.string() })).min(1),
  attempts: z.array(z.object({ facet: FacetName, input: z.string() })).default([]),
  hintsOpened: z.array(z.string()).default([]),
  revealed: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
});
export type Submission = z.input<typeof Submission>;
export type SubmissionData = z.output<typeof Submission>;

export type FacetOutcome = { facet: FacetName; outcome: "pass" | "fail" | "retry"; matchedAnswerId?: string; message?: string };

/** `retry`: an input was empty, had Latin letters or matched an alternate; nothing was graded or logged. */
export type Verdict = { status: "retry"; results: FacetOutcome[] } | { status: "graded"; passed: boolean; results: FacetOutcome[] };
