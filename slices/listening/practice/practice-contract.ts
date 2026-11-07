import { z } from "zod";
import { JlptLevel } from "@mojibun/shared";

/** The wire shapes of Practice Text dialogues. A dialogue plays through the same `ClipView` and `AnswerResponse` as a clip. */

/** The fixed topics a Learner can pick; there is no free-text prompt (listening.md#what-the-learner-chooses). */
export const TOPICS = ["仕事", "旅行", "学校", "家族", "買い物", "食事", "健康", "趣味"] as const;

export const LENGTHS = ["short", "medium", "exam"] as const;

/** The JLPT 聴解 task types a level's questions rotate through; 概要理解 starts at N3 (listening.md#dialogues). */
export const taskTypes = (level: JlptLevel): string[] =>
  level === "N5" || level === "N4" ? ["課題理解", "ポイント理解"] : ["課題理解", "ポイント理解", "概要理解"];

/** What the Generate screen sends. A type outside the level's task types is refused. */
export const GenerateRequest = z
  .object({
    level: JlptLevel,
    passageType: z.string(),
    length: z.enum(LENGTHS),
    topic: z.enum(TOPICS).optional(),
  })
  .refine(({ level, passageType }) => passageType === "any" || taskTypes(level).includes(passageType));
export type GenerateRequest = z.infer<typeof GenerateRequest>;

/** What the Generate screen offers: the Cleared Levels, and how many Practice Texts are left in the rolling 24 h. */
export const Options = z.object({ cleared: z.array(JlptLevel), remaining: z.number().int().nonnegative() });
export type Options = z.infer<typeof Options>;

/** One Practice Text in the Learner's library; it can be opened once its passage is approved and voiced. */
export const LibraryEntry = z.object({
  id: z.string(),
  level: JlptLevel,
  passageType: z.string(),
  length: z.enum(LENGTHS),
  topic: z.string().optional(),
  at: z.string(),
  ready: z.boolean(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;
