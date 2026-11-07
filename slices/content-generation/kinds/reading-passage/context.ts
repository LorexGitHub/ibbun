import { z } from "zod";
import { JlptLevel, LearnerId, StudyItemId } from "@mojibun/shared";

/** The batch a Batch Text is for: the `batch-text.generate` payload, kept on the Generation Request for retries. */
export const BatchContext = z.object({
  learnerId: LearnerId,
  level: z.union([JlptLevel, z.literal("unlevelled")]),
  itemIds: z.array(StudyItemId).min(1),
});
export type BatchContext = z.output<typeof BatchContext>;

const PREFIX = "batch-text ";

/** The Generation Request's `reason`, which carries the batch from the job to every attempt. */
export const reasonOf = (context: BatchContext): string => PREFIX + JSON.stringify(context);

/** The batch a request was opened for, or null if its reason is not one of ours. */
export const contextOf = (reason: string): BatchContext | null => {
  if (!reason.startsWith(PREFIX)) return null;
  try {
    return BatchContext.parse(JSON.parse(reason.slice(PREFIX.length)));
  } catch {
    return null;
  }
};
