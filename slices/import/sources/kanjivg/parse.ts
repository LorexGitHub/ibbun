import type { KanjiStrokesRecord } from "@ibbun/content-graph/authoring";

const KANJI = /<kanji id="kvg:kanji_([0-9a-f]{5})">([\s\S]*?)<\/kanji>/g;
const STROKE = /<path\b[^>]*?\sd="([^"]+)"/g;

/**
 * Parses KanjiVG's single `kanjivg-<date>.xml` into stroke records keyed by code point, in file order. Variant
 * drawings (`kanji_098df-Kaisho`) are not matched. A character with no strokes fails the whole run, so a changed
 * upstream format cannot half-apply or wipe the strokes a Kanji already has.
 */
export const parseKanjivg = (xml: string): KanjiStrokesRecord[] => {
  const records = [...xml.matchAll(KANJI)].map(([, key, body]) => ({ key: key!, strokes: [...body!.matchAll(STROKE)].map((m) => m[1]!) }));
  if (records.length === 0) throw new Error("the KanjiVG file holds no kanji");
  const empty = records.find((r) => r.strokes.length === 0);
  if (empty) throw new Error(`KanjiVG character ${empty.key} has no strokes`);
  return records;
};
