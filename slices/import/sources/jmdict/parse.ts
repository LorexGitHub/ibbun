import type { WordRecord } from "@ibbun/content-graph/authoring";
import { z } from "zod";

const Form = z.object({ common: z.boolean(), text: z.string().min(1) });
const Sense = z.object({
  partOfSpeech: z.array(z.string()),
  gloss: z.array(z.object({ lang: z.string(), text: z.string() })),
});
const Entry = z.object({ id: z.string().min(1), kanji: z.array(Form), kana: z.array(Form).min(1), sense: z.array(Sense).min(1) });
const Dictionary = z.object({ words: z.array(z.unknown()) });

/** jmdict-simplified marks an entry's common forms with one flag; that is the only priority data it keeps. */
const priorityTags = (entry: z.output<typeof Entry>): string[] =>
  [...entry.kanji, ...entry.kana].some((form) => form.common) ? ["common"] : [];

const record = (entry: z.output<typeof Entry>): WordRecord => ({
  key: entry.id,
  forms: entry.kanji.map((f) => f.text),
  readings: entry.kana.map((f) => ({ text: f.text, pitchAccent: null })),
  senses: entry.sense.map((s) => ({ partsOfSpeech: s.partOfSpeech, glosses: s.gloss.filter((g) => g.lang === "eng").map((g) => g.text) })),
  priorityTags: priorityTags(entry),
});

/**
 * Parses a jmdict-simplified `jmdict-eng` file into Word records in upstream order. An entry that does not
 * match the format fails the whole run, so a changed upstream format cannot half-apply.
 */
export const parseJmdict = (json: string): WordRecord[] => {
  const { words } = Dictionary.parse(JSON.parse(json));
  const seen = new Set<string>();
  return words.map((raw, i) => {
    const entry = Entry.safeParse(raw);
    if (!entry.success) throw new Error(`JMdict entry #${i} is not in the jmdict-simplified format: ${entry.error.message}`);
    if (seen.has(entry.data.id)) throw new Error(`JMdict entry ${entry.data.id} appears twice`);
    seen.add(entry.data.id);
    return record(entry.data);
  });
};
