import type { JlptLevel } from "@mojibun/shared";
import { PASSAGE_TYPES } from "../reading-passage/config.ts";
import { earlierItemCount, targetLength } from "../reading-passage/plan-numbers.ts";
import { LINES, taskTypes } from "../dialogue/config.ts";
import { DIALOGUE_LINE_SHARE, LENGTH_SHARE, type Length } from "./config.ts";

/** What the prompt asks for: the size and type of the text, and how many weakest Known items to give. */
export type Shape = { size: number; type: string; weakest: number };

const ANY = "any";

/** A passage of the chosen length, in characters, of the chosen JLPT passage type or any of the level's. */
export const passageShape = (level: JlptLevel, length: Length, type: string): Shape => {
  const size = targetLength(level, LENGTH_SHARE[length]);
  return { size, type: type === ANY ? `one of ${PASSAGE_TYPES[level].join(", ")}` : `a ${type}`, weakest: earlierItemCount(size) };
};

/** A dialogue of the chosen length, in lines, for the chosen 聴解 task type or any of the level's; one weakest item per line. */
export const dialogueShape = (level: JlptLevel, length: Length, type: string): Shape => {
  const size = Math.max(LINES.N5, Math.round(LINES[level] * DIALOGUE_LINE_SHARE[length]));
  return { size, type: type === ANY ? taskTypes(level).join(" or ") : type, weakest: size };
};
