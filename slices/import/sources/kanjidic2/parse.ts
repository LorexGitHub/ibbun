import type { KanjiRecord } from "@ibbun/content-graph/authoring";
import { z } from "zod";

const Character = z.object({
  literal: z.string().min(1),
  misc: z.object({
    grade: z.number().int().nullable(),
    strokeCounts: z.array(z.number().int()).min(1),
    frequency: z.number().int().nullable(),
  }),
  readingMeaning: z
    .object({
      groups: z.array(
        z.object({
          readings: z.array(z.object({ type: z.string(), value: z.string() })),
          meanings: z.array(z.object({ lang: z.string(), value: z.string() })),
        }),
      ),
    })
    .nullable(),
});
type Character = z.output<typeof Character>;

const Kanjidic = z.object({ characters: z.array(z.unknown()) });
const Kradfile = z.object({ kanji: z.record(z.string(), z.array(z.string())) });

const groups = (c: Character) => (c.readingMeaning ? c.readingMeaning.groups : []);

const readings = (c: Character, type: "ja_on" | "ja_kun") =>
  groups(c).flatMap((g) => g.readings.filter((r) => r.type === type).map((r) => r.value));

const meanings = (c: Character) => groups(c).flatMap((g) => g.meanings.filter((m) => m.lang === "en").map((m) => m.value));

/**
 * Parses a jmdict-simplified `kanjidic2-all` file and its `kradfile` into Kanji records in upstream order.
 * Every character is kept, including the ones with no English meaning or no readings. The first stroke count is the
 * accepted one; the rest are common miscounts. KanjiVG strokes arrive from their own source, so `strokes` starts empty.
 * A character that does not match the format fails the whole run, so a changed upstream format cannot half-apply.
 */
export const parseKanjidic = (kanjidicJson: string, kradfileJson: string): KanjiRecord[] => {
  const { characters } = Kanjidic.parse(JSON.parse(kanjidicJson));
  const { kanji: components } = Kradfile.parse(JSON.parse(kradfileJson));
  const seen = new Set<string>();
  return characters.map((raw, i) => {
    const parsed = Character.safeParse(raw);
    if (!parsed.success) throw new Error(`KANJIDIC2 character #${i} is not in the jmdict-simplified format: ${parsed.error.message}`);
    const c = parsed.data;
    if (seen.has(c.literal)) throw new Error(`KANJIDIC2 character ${c.literal} appears twice`);
    seen.add(c.literal);
    return {
      key: c.literal,
      meanings: meanings(c),
      onReadings: readings(c, "ja_on"),
      kunReadings: readings(c, "ja_kun"),
      grade: c.misc.grade,
      frequency: c.misc.frequency,
      strokeCount: c.misc.strokeCounts[0]!,
      components: Object.hasOwn(components, c.literal) ? components[c.literal]! : [],
      strokes: [],
    };
  });
};
