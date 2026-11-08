import { z } from "zod";
import type { JlptLevel } from "@mojibun/shared";

const Example = z.object({ jp: z.string().min(1), en: z.string() });

const Entry = z.object({
  title: z.string().min(1),
  short_explanation: z.string(),
  long_explanation: z.string(),
  formation: z.string(),
  examples: z.array(Example),
});

/** One hanabira Grammar Point as seeded (grammar-points.md#inventory). `key` is its place in the level file at the pinned commit. */
export type HanabiraPoint = {
  key: string;
  level: JlptLevel;
  /** The pattern in Japanese, without hanabira's romaji in brackets. */
  title: string;
  meaning: string;
  notes: string;
  formation: string[];
  examples: { text: string; translationEn: string }[];
};

/** hanabira writes "ないではおかない (~ nai de wa okanai)": the Japanese part comes first and the romaji follows in brackets. */
export const japaneseTitle = (title: string): string => title.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();

/** "Noun + が + いちばん" is a row of slots. */
const slots = (formation: string): string[] =>
  formation
    .split("+")
    .map((slot) => slot.trim())
    .filter(Boolean);

const point = (level: JlptLevel, index: number, entry: z.output<typeof Entry>): HanabiraPoint => ({
  key: `${level}:${index}`,
  level,
  title: japaneseTitle(entry.title),
  meaning: entry.short_explanation,
  notes: entry.long_explanation,
  formation: slots(entry.formation),
  examples: entry.examples.map(({ jp, en }) => ({ text: jp, translationEn: en })),
});

/** Parses one `grammar_json/grammar_ja_<level>_*.json` file. */
export const parseHanabira = (level: JlptLevel, json: string): HanabiraPoint[] =>
  z
    .array(Entry)
    .parse(JSON.parse(json))
    .map((entry, index) => point(level, index, entry));
