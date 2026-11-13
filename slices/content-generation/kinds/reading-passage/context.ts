import { z } from "zod";
import { JlptLevel, LearnerId, StudyItemId } from "@ibbun/shared";
import { reasonCodec } from "../passage/reason.ts";

/** The batch a Batch Text is for: the `batch-text.generate` payload, kept on the Generation Request for retries. */
export const BatchContext = z.object({
  learnerId: LearnerId,
  level: z.union([JlptLevel, z.literal("unlevelled")]),
  itemIds: z.array(StudyItemId).min(1),
});
export type BatchContext = z.output<typeof BatchContext>;

export const { reasonOf, contextOf } = reasonCodec("batch-text ", BatchContext);
