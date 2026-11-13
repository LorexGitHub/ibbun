import { JLPT_LEVELS, type JlptLevel } from "@ibbun/shared";

type RawText = { name: string; text: string };

/**
 * Reads one list file per level, easiest first, and gives each key its easiest level
 * (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists). A key on a second list is reported through
 * `collision` and keeps the level it already had. A missing file fails the whole run.
 */
export const easiestLevels = <I extends { key: string }>(
  files: RawText[],
  fileOf: (level: JlptLevel) => string,
  itemsOf: (file: RawText, level: JlptLevel) => I[],
  collision: (item: I, level: JlptLevel, kept: JlptLevel) => string,
  report: (line: string) => void,
): Map<string, JlptLevel> => {
  const levels = new Map<string, JlptLevel>();
  for (const level of JLPT_LEVELS) {
    const file = files.find((f) => f.name === fileOf(level));
    if (!file) throw new Error(`the raw files hold no ${fileOf(level)}`);
    for (const item of itemsOf(file, level)) {
      const kept = levels.get(item.key);
      if (kept === undefined) levels.set(item.key, level);
      else if (kept !== level) report(collision(item, level, kept));
    }
  }
  return levels;
};
