import { z } from "zod";

/** Easiest first. */
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

export const JlptLevel = z.enum(JLPT_LEVELS);
export type JlptLevel = z.infer<typeof JlptLevel>;

/** Negative when `a` is easier than `b`. */
export const compareLevels = (a: JlptLevel, b: JlptLevel): number =>
  JLPT_LEVELS.indexOf(a) - JLPT_LEVELS.indexOf(b);
