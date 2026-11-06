import { defineJob } from "@mojibun/jobs";
import { JlptLevel, LearnerId, StudyItemId } from "@mojibun/shared";
import { z } from "zod";

/**
 * Job contracts that live in core so a Learner-facing slice can enqueue work an admin slice handles
 * (architecture.md#dependency-rules). Handlers live in the slices, never here.
 */

/** `learn` asks for the Batch Text of a picked batch (ADR 0008, batch-text.md). */
export const BatchTextGenerate = defineJob(
  "batch-text.generate",
  z.object({ learnerId: LearnerId, level: JlptLevel, itemIds: z.array(StudyItemId).nonempty() }),
);

/** `reading` or `listening` asks for a Practice Text of a Cleared Level (ADR 0013, listening.md#practice-texts). */
export const PracticeGenerate = defineJob(
  "practice.generate",
  z.object({
    learnerId: LearnerId,
    practiceTextId: z.uuid(),
    level: JlptLevel,
    kind: z.enum(["passage", "dialogue"]),
  }),
);

/** Audio for a Sentence or for every line of a dialogue (listening.md#audio-files). */
export const ListeningSynthesise = defineJob(
  "listening.synthesise",
  z.object({
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("sentence"), sentenceId: z.uuid() }).strict(),
      z.object({ kind: z.literal("dialogue"), passageId: z.uuid() }).strict(),
    ]),
  }),
);

/** Draft the next attempt of a Generation Request; `feedback` is the last rejection reason (content-approval.md). */
export const ContentGenerate = defineJob(
  "content.generate",
  z.object({ requestId: z.uuid(), feedback: z.string().min(1).optional() }),
);

/** Check and review the draft a Generation Run produced (content-approval.md#wiring). */
export const ContentReview = defineJob("content.review", z.object({ requestId: z.uuid(), runId: z.uuid() }));
