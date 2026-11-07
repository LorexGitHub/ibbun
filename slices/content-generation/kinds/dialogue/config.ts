import type { JlptLevel } from "@mojibun/shared";

/** About how many lines a dialogue has, growing from 4 at N5 to 12 at N1 (listening.md#dialogues). */
export const LINES: Record<JlptLevel, number> = { N5: 4, N4: 6, N3: 8, N2: 10, N1: 12 };

const TASK_TYPES = {
  課題理解: "what one of the speakers will do next",
  ポイント理解: "why something happens, or one detail",
  概要理解: "the gist of the whole conversation",
} as const;
export type TaskType = keyof typeof TASK_TYPES;

/** The JLPT 聴解 task types a level's questions rotate through; 概要理解 starts at N3. */
export const taskTypes = (level: JlptLevel): TaskType[] =>
  level === "N5" || level === "N4" ? ["課題理解", "ポイント理解"] : ["課題理解", "ポイント理解", "概要理解"];

export const describeTaskType = (type: TaskType) => `${type}: ${TASK_TYPES[type]}`;

/** VOICEVOX characters for each speaker; a dialogue takes one of each, by hash (listening.md#voices). */
export const VOICES = { 男: ["玄野武宏", "青山龍星"], 女: ["四国めたん", "春日部つむぎ"] } as const;
