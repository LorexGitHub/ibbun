import { z } from "zod";
import { LearnerId, StudyItemId, Timestamp } from "@mojibun/shared";

/**
 * Every Review `kind` (ADR 0001). Only `srs` and `manual` feed the Scheduler;
 * the rest are logged so nothing a Learner did is lost.
 */
export const ReviewKind = z.enum(["srs", "manual", "learn", "wrap-up", "ghost", "cram", "lookup"]);
export type ReviewKind = z.infer<typeof ReviewKind>;

/** One graded facet of an answer (review-answer-model.md#what-a-review-records). */
export const FacetResult = z.object({
  facet: z.string().min(1),
  rawInput: z.string(),
  normalisedInput: z.string(),
  outcome: z.enum(["pass", "fail"]),
  matchedAnswerId: z.string().optional(),
});
export type FacetResult = z.infer<typeof FacetResult>;

/** What a Listening Review adds (listening.md#what-a-listening-review-records). */
export const ListeningDetail = z.object({
  replays: z.number().int().nonnegative(),
  slow: z.boolean(),
  examMode: z.boolean(),
});

/** Who made a `manual` Review: Placement, or "I know this" in Learn. */
export const ManualSource = z.enum(["placement", "learn-skip"]);

export const ReviewDetail = z.object({
  exampleId: z.string().optional(),
  facets: z.array(FacetResult).default([]),
  attempts: z.array(z.object({ facet: z.string().min(1), input: z.string() })).default([]),
  hintsOpened: z.array(z.string()).default([]),
  revealed: z.boolean().default(false),
  timeToAnswerMs: z.number().int().nonnegative().optional(),
  listening: ListeningDetail.optional(),
  source: ManualSource.optional(),
});
export type ReviewDetail = z.infer<typeof ReviewDetail>;

/** A Review as a caller hands it to `record()`. */
export const NewReview = ReviewDetail.extend({
  learnerId: LearnerId,
  studyItemId: StudyItemId,
  kind: ReviewKind,
  passed: z.boolean(),
  at: Timestamp,
});
export type NewReview = z.input<typeof NewReview>;

/** A Review as the log holds it. */
export type Review = z.output<typeof NewReview> & { id: string };
