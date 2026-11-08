import type { KanjiLevelRecord } from "@mojibun/content-graph/authoring";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";
import { easiestLevels } from "../easiest.ts";

/** Easiest first: the order the lists are read in, and the order a collision is settled in. */
export const LEVELS: readonly JlptLevel[] = JLPT_LEVELS;
export const fileOf = (level: JlptLevel) => `${level.toLowerCase()}.html`;

/** The first cell of a table row: the Kanji, wrapped in the link to its sentences page. */
const KANJI_CELL = /<tr><td><a[^>]*>([^<]*)<\/a><\/td>/g;

/** The Kanji of one list in page order, each cell checked to be one character. */
const kanjiOf = (file: { name: string; text: string }): string[] => {
  const cells = [...file.text.matchAll(KANJI_CELL)].map((m) => m[1]!.trim());
  if (cells.length === 0) throw new Error(`${file.name} lists no Kanji`);
  return cells.map((cell, i) => {
    if ([...cell].length !== 1) throw new Error(`${file.name} row #${i + 1} (${JSON.stringify(cell)}) is not one character`);
    return cell;
  });
};

/**
 * Parses the archived Tanos `jlpt<n>/kanji/` pages into one List level per Kanji literal
 * (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists). A Kanji on two lists keeps the easiest level, and each
 * collision goes to `report`. A missing file, a page with no rows or a cell that is not one character fails the
 * whole run, so a changed page cannot half-apply.
 */
export const parseKanjiLevels = (files: { name: string; text: string }[], report: (line: string) => void): KanjiLevelRecord[] => {
  const levels = easiestLevels(
    files,
    fileOf,
    (file) => kanjiOf(file).map((key) => ({ key })),
    ({ key }, level, kept) => `${key} is also listed at ${level}: kept ${kept}`,
    report,
  );
  return [...levels].map(([key, level]) => ({ key, level }));
};
