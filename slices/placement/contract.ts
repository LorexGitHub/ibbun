import { z } from "zod";
import { JlptLevel, StudyItemId } from "@mojibun/shared";

export { JlptLevel };

/** One row of the tick-list. A Known item is shown ticked and cannot be unticked: once Known, always Known. */
export const PlacementItem = z.object({
  id: StudyItemId,
  type: z.enum(["kanji", "word", "grammar_point"]),
  label: z.string(),
  reading: z.string().nullable(),
  meaning: z.string().nullable(),
  known: z.boolean(),
});
export type PlacementItem = z.infer<typeof PlacementItem>;

/** `GET /api/placement/:level` */
export const PlacementList = z.object({ level: JlptLevel, items: z.array(PlacementItem) });
export type PlacementList = z.infer<typeof PlacementList>;

/** `POST /api/placement/:level`: the Study Items the Learner ticked. */
export const PlacementSubmission = z.object({ studyItemIds: z.array(StudyItemId).min(1) });
export type PlacementSubmission = z.infer<typeof PlacementSubmission>;

/** How many items became Known; items that already were are not counted. */
export const PlacementResult = z.object({ recorded: z.number().int().nonnegative() });
export type PlacementResult = z.infer<typeof PlacementResult>;
