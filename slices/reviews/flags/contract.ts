import { z } from "zod";
import { StudyItemId } from "@mojibun/shared";
import { Facet } from "../contract.ts";

/** The facets whose accepted answers are an Example's own answer data; a Kanji's meanings are not. */
export const FLAGGABLE_FACETS = ["cloze", "reading"] as const satisfies readonly Facet[];

/** "My answer was right" for one graded facet of the Learner's latest Review of an Example. The input is read from the Review log, never sent. */
export const FlagRequest = z.object({ studyItemId: StudyItemId, exampleId: z.string().min(1), facet: Facet });
export type FlagRequest = z.infer<typeof FlagRequest>;
