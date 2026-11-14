import type { WordLevelRecord } from "@ibbun/content-graph/authoring";
import type { JlptLevel } from "@ibbun/shared";
import { easiestLevels } from "../easiest.ts";
import { parseCsv } from "./csv.ts";

/** Easiest first: the order the lists are read in, and the order a collision is settled in. */
export const LEVELS: readonly JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const fileOf = (level: JlptLevel) => `${level.toLowerCase()}.csv`;

const ENT_SEQ = /^\d+$/;

type Entry = { entry: string; word: string };

/** The rows of one list that name exactly one JMdict entry. The others go to `report`, one line each. */
const entries = (file: { name: string; text: string }, level: JlptLevel, report: (line: string) => void): Entry[] => {
  const [header = [], ...rows] = parseCsv(file.text);
  const column = (name: string) => header.indexOf(name);
  const [seq, kana, kanji] = [column("jmdict_seq"), column("kana"), column("kanji")] as [number, number, number];
  if (seq === -1 || kana === -1 || kanji === -1) throw new Error(`${file.name} has no jmdict_seq, kana and kanji columns`);
  return rows.flatMap((row) => {
    const word = `${row[kanji] || row[kana]} (${level})`;
    const entry = (row[seq] || "").trim();
    if (entry === "") report(`${word} has no JMdict match: skipped`);
    else if (!ENT_SEQ.test(entry)) report(`${word} has several JMdict matches (${entry}): skipped`);
    else return [{ entry, word }];
    return [];
  });
};

/**
 * Parses yomitan-jlpt-vocab's `original_data/n5.csv` … `n1.csv` into one List level per JMdict `ent_seq`
 * (jlpt-levels.md#collisions-and-misses-in-the-tanos-lists). A Word on two lists keeps the easiest level. A row
 * whose `jmdict_seq` is blank or names several entries is skipped. Every collision and every skipped row goes to
 * `report`, one line each. A file that is missing or has no `jmdict_seq` column fails the whole run.
 */
export const parseLevels = (files: { name: string; text: string }[], report: (line: string) => void): WordLevelRecord[] => {
  const levels = easiestLevels(
    files,
    fileOf,
    (file, level) => entries(file, level, report).map(({ entry, word }) => ({ key: entry, word })),
    ({ key, word }, _level, kept) => `ent_seq ${key} (${word}) is also listed at ${kept}: kept ${kept}`,
    report,
  );
  return [...levels].map(([key, level]) => ({ key, level }));
};
