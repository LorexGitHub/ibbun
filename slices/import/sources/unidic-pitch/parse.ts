import type { UnidicRecord } from "@mojibun/content-graph/authoring";

/** `lex.csv` columns of unidic-cwj (the 33-field MeCab layout). */
const COLUMNS = 33;
const [SURFACE, COST, POS2, ORTH_BASE, KANA, KANA_BASE, ACCENT] = [0, 3, 5, 14, 24, 25, 28] as const;
const PROPER_NOUN = "固有名詞";
const ACCENT_TYPES = /^\d+(,\d+)*$/;

export const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

type Lexeme = { cost: number; proper: boolean; accents: number[] };

/** The fields of one CSV line. A field holding a comma is quoted: `aType` is `"1,0"` for a word with two accents. */
const fieldsOf = (line: string) => {
  if (!line.includes('"')) return line.split(",");
  return [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].slice(0, -1).map(([, field]) => (field!.startsWith('"') ? field!.slice(1, -1).replaceAll('""', '"') : field!));
};

/** The dictionary-form row of a lexeme with an accent, or null: an inflected row, a row without `aType`, or a row of another shape. */
const lexemeOf = (line: string): { key: string; form: string; reading: string; lexeme: Lexeme } | null => {
  const f = fieldsOf(line);
  const form = f[ORTH_BASE]!;
  if (f.length !== COLUMNS || f[SURFACE] !== form || f[KANA] !== f[KANA_BASE] || !ACCENT_TYPES.test(f[ACCENT]!)) return null;
  const reading = toHiragana(f[KANA_BASE]!);
  return { key: `${form}\t${reading}`, form, reading, lexeme: { cost: Number(f[COST]), proper: f[POS2] === PROPER_NOUN, accents: f[ACCENT]!.split(",").map(Number) } };
};

/** Common words before names (橋 is also the surname ハシ), then the cheaper MeCab entry first: the order a reader would pick. */
const accentsOf = (lexemes: Lexeme[]) => {
  const common = lexemes.filter((l) => !l.proper);
  const chosen = (common.length ? common : lexemes).sort((a, b) => a.cost - b.cost);
  return [...new Set(chosen.flatMap((l) => l.accents))];
};

const lines = function* (csv: Uint8Array) {
  const decoder = new TextDecoder();
  for (let from = 0; from < csv.length; ) {
    const end = csv.indexOf(10, from);
    const to = end === -1 ? csv.length : end;
    yield decoder.decode(csv.subarray(from, to)).replace(/\r$/, "");
    from = to + 1;
  }
};

/**
 * Parses unidic-cwj's `lex.csv` into one record per dictionary-form lexeme that has an accent, keyed by orthographic base
 * and kana base (research/pitch-accent-source.md#format). A lexeme listed more than once, as a common word and as a
 * surname or as two homographs, gets the accents of the common words first, cheaper MeCab entries before dearer ones.
 * Rows of other shapes are skipped; a file with no usable row fails the run.
 */
export const parseLexicon = (csv: Uint8Array): UnidicRecord[] => {
  const byKey = new Map<string, { form: string; reading: string; lexemes: Lexeme[] }>();
  for (const line of lines(csv)) {
    const row = lexemeOf(line);
    if (!row) continue;
    const kept = byKey.get(row.key);
    if (kept) kept.lexemes.push(row.lexeme);
    else byKey.set(row.key, { form: row.form, reading: row.reading, lexemes: [row.lexeme] });
  }
  if (byKey.size === 0) throw new Error("lex.csv holds no lexeme with an accent: is it the 33-column unidic-cwj file?");
  return [...byKey].map(([key, { form, reading, lexemes }]) => ({ key, form, reading, pitchAccent: accentsOf(lexemes) }));
};
