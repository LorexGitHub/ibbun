import { z } from "zod";
import type { WiktionaryRecord } from "@mojibun/content-graph/authoring";

/** Hard redirects (`{title, redirect, pos}`) carry no language; they are the only lines without one. */
const Language = z
  .object({ lang_code: z.string().optional(), redirect: z.string().optional() })
  .refine((l) => l.lang_code !== undefined || l.redirect !== undefined, { error: "no language and no redirect" });

const Entry = z.object({
  word: z.string().min(1),
  senses: z.array(z.object({ glosses: z.array(z.string()).optional(), form_of: z.array(z.unknown()).optional() })).optional(),
});

/** ja Wiktionary files a kanji spelling under its kana page with a one-line stub; the stub says nothing about the sense. */
const STUB = /(の漢字表記|参照)[。\s]*$/;

const NEWLINE = 0x0a;

/** The lines of a buffer, decoded one at a time: the whole dump is too large to hold as one string. */
function* lines(bytes: Uint8Array): Generator<string> {
  const decoder = new TextDecoder();
  for (let start = 0; start < bytes.length; ) {
    const found = bytes.indexOf(NEWLINE, start);
    const end = found === -1 ? bytes.length : found;
    if (end > start) yield decoder.decode(bytes.subarray(start, end));
    start = end + 1;
  }
}

const glossOf = (glosses: string[] | undefined): string | null => {
  const text = (glosses ?? []).join("：").trim();
  return text && !STUB.test(text) ? text : null;
};

type Entry = z.output<typeof Entry>;

const fail = (n: number, why: string): never => {
  throw new Error(`ja Wiktionary line ${n} is not in the wiktextract format: ${why}`);
};

/** The line's entry when it is Japanese; null for another language or a redirect. */
const japanese = (line: string, n: number): Entry | null => {
  const raw: unknown = JSON.parse(line);
  const language = Language.safeParse(raw);
  if (!language.success) return fail(n, language.error.message);
  if (language.data.lang_code !== "ja") return null;
  const entry = Entry.safeParse(raw);
  return entry.success ? entry.data : fail(n, entry.error.message);
};

const recordsOf = ({ word, senses = [] }: Entry, index: number): WiktionaryRecord[] =>
  senses.flatMap((sense, i) => {
    const text = sense.form_of ? null : glossOf(sense.glosses);
    return text ? [{ key: `${word}#${index}.${i}`, title: word, text }] : [];
  });

/**
 * Parses a wiktextract dump of the Japanese edition into one record per Japanese gloss, in dump order. Entries of other
 * languages, redirect stubs (`form_of`) and one-line cross-references are skipped. Keys are `title#entry.gloss`, counting
 * the Japanese entries of a page and the glosses of an entry, skipped ones included, so a skipped gloss never renumbers
 * its neighbours. A line that is not an entry fails the whole run, so a changed upstream format cannot half-apply.
 */
export const parseWiktionary = (jsonl: Uint8Array): WiktionaryRecord[] => {
  const entries = new Map<string, number>();
  const records: WiktionaryRecord[] = [];
  let n = 0;
  for (const line of lines(jsonl)) {
    const entry = japanese(line, ++n);
    if (!entry) continue;
    const index = entries.get(entry.word) ?? 0;
    entries.set(entry.word, index + 1);
    records.push(...recordsOf(entry, index));
  }
  return records;
};
