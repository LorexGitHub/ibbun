import { z } from "zod";
import { JlptLevel } from "@mojibun/shared";

/** How many Study Items are due, in total and by type (the Today screen's "11 kanji, 5 words and 2 grammar points"). */
export const Due = z.object({
  total: z.number().int().nonnegative(),
  kanji: z.number().int().nonnegative(),
  word: z.number().int().nonnegative(),
  grammarPoint: z.number().int().nonnegative(),
});
export type Due = z.infer<typeof Due>;

/** One JLPT Level's row in "Your way up": every Study Item at that level, and how many the Learner knows. */
export const LevelMastery = z.object({
  level: JlptLevel,
  total: z.number().int().nonnegative(),
  known: z.number().int().nonnegative(),
});
export type LevelMastery = z.infer<typeof LevelMastery>;

/** `GET /api/dashboard/today`. */
export const Today = z.object({
  due: Due,
  /** Days in a row, up to today or yesterday, with at least one Review. */
  streakDays: z.number().int().nonnegative(),
  /** N5 first, one entry per level. */
  levels: z.array(LevelMastery),
});
export type Today = z.infer<typeof Today>;
