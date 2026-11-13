import { z } from "zod";
import { JlptLevel } from "@ibbun/shared";

/** How many Study Items are due, in total and by type (the Today screen's "11 kanji, 5 words and 2 grammar points"). */
export const Due = z.object({
  total: z.number().int().nonnegative(),
  kanji: z.number().int().nonnegative(),
  word: z.number().int().nonnegative(),
  grammarPoint: z.number().int().nonnegative(),
});
export type Due = z.infer<typeof Due>;

/** How many Study Items there are of some kind, and how many of them the Learner knows. */
export const Mastery = z.object({
  total: z.number().int().nonnegative(),
  known: z.number().int().nonnegative(),
});
export type Mastery = z.infer<typeof Mastery>;

/** One JLPT Level's row in "Your way up": every Study Item at that level, and how many the Learner knows. */
export const LevelMastery = Mastery.extend({ level: JlptLevel });
export type LevelMastery = z.infer<typeof LevelMastery>;

/** `GET /api/dashboard/today`. */
export const Today = z.object({
  due: Due,
  /** Days in a row, up to today or yesterday, with at least one Review. */
  streakDays: z.number().int().nonnegative(),
  /** N5 first, one entry per level. */
  levels: z.array(LevelMastery),
  /** How many new Study Items one Learn batch holds, for "Learn 5 new". */
  batchSize: z.number().int().positive(),
});
export type Today = z.infer<typeof Today>;

/** `GET /api/dashboard/levels/:level`: one JLPT Level's page. */
export const LevelPage = z.object({
  level: JlptLevel,
  kanji: Mastery,
  word: Mastery,
  grammarPoint: Mastery,
  /** Study Items of this level that are due now. */
  due: z.number().int().nonnegative(),
  /** Listening Clips at this level. */
  clips: z.number().int().nonnegative(),
});
export type LevelPage = z.infer<typeof LevelPage>;
