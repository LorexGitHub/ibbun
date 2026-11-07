import type { JlptLevel } from "@mojibun/shared";

/** Where in the level's exam range each length the Learner can choose sits: 0 is the shortest, 1 the longest. */
export const LENGTH_SHARE = { short: 0, medium: 0.5, exam: 1 } as const;
export type Length = keyof typeof LENGTH_SHARE;

/** Lines of an exam-length dialogue, from about 4 at N5 to about 12 at N1 (listening.md#dialogues). */
export const DIALOGUE_LINES: Record<JlptLevel, number> = { N5: 4, N4: 6, N3: 8, N2: 10, N1: 12 };

/** The share of the exam-length lines each length gets, never under the N5 count. */
export const DIALOGUE_LINE_SHARE: Record<Length, number> = { short: 0.5, medium: 0.75, exam: 1 };

/** The 聴解 task types a dialogue can be written for; 概要理解 only from N3 (listening.md#dialogues). */
const BASIC_TASKS = ["課題理解", "ポイント理解"] as const;
const ALL_TASKS = [...BASIC_TASKS, "概要理解"] as const;
export const TASK_TYPES: Record<JlptLevel, readonly string[]> = { N5: BASIC_TASKS, N4: BASIC_TASKS, N3: ALL_TASKS, N2: ALL_TASKS, N1: ALL_TASKS };
