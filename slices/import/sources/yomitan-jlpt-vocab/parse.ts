import type { WordLevelRecord } from "@mojibun/content-graph/authoring";
import type { JlptLevel } from "@mojibun/shared";
import { parseCsv } from "./csv.ts";

/** Easiest first: the order the lists are read in, and the order a collision is settled in. */
export const LEVELS: readonly JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const fileOf = (level: JlptLevel) => `${level.toLowerCase()}.csv`;

const ENT_SEQ = /^\d+$/;

/**
 * Parses yomitan-jlpt-vocab's `original_data/n5.csv` … `n1.csv` into one List level per JMdict `ent_seq`
 * (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists). A Word on two lists keeps the easiest level. A row
 * whose `jmdict_seq` is blank or names several entries is skipped. Every collision and every skipped row goes to
 * `report`, one line each. A file that is missing or has no `jmdict_seq` column fails the whole run.
 */
export const parseLevels = (files: { name: string; text: string }[], report: (line: string) => void): WordLevelRecord[] => {
  const levels = new Map<string, JlptLevel>();
  for (const level of LEVELS) {
    const file = files.find((f) => f.name === fileOf(level));
    if (!file) throw new Error(`the raw files hold no ${fileOf(level)}`);
    const [header = [], ...rows] = parseCsv(file.text);
    const column = (name: string) => header.indexOf(name);
    const [seq, kana, kanji] = [column("jmdict_seq"), column("kana"), column("kanji")] as [number, number, number];
    if (seq === -1 || kana === -1 || kanji === -1) throw new Error(`${file.name} has no jmdict_seq, kana and kanji columns`);
    for (const row of rows) {
      const word = `${row[kanji] || row[kana]} (${level})`;
      const entry = (row[seq] ?? "").trim();
      if (entry === "") report(`${word} has no JMdict match: skipped`);
      else if (!ENT_SEQ.test(entry)) report(`${word} has several JMdict matches (${entry}): skipped`);
      else if (levels.has(entry) && levels.get(entry) !== level) report(`ent_seq ${entry} (${word}) is also listed at ${levels.get(entry)}: kept ${levels.get(entry)}`);
      else if (!levels.has(entry)) levels.set(entry, level);
    }
  }
  return [...levels].map(([key, level]) => ({ key, level }));
};
