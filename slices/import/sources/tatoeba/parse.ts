import type { SentenceLink } from "@ibbun/content-graph/authoring";

const NULL = "\\N";

/** Rows of a tab-separated Tatoeba export. A blank line is skipped. */
export const rows = (text: string): string[][] =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.replace(/\r$/, "").split("\t"));

export type Posted = { text: string; author: string | null };

/** `*_sentences_detailed` rows: id, language, text, username, date added, date modified. */
export const parseDetailed = (tsv: string): Map<string, Posted> =>
  new Map(rows(tsv).map(([id, , text, author]) => [id!, { text: text!, author: author && author !== NULL ? author : null }]));

/** `jpn-eng_links` rows: a Japanese sentence id and an English one. */
export const parseLinks = (tsv: string): [string, string][] => rows(tsv).map(([jpn, eng]) => [jpn!, eng!]);

/** Sentence ids of an id-first export such as `jpn_sentences_CC0`. */
export const parseIds = (tsv: string): Set<string> => new Set(rows(tsv).map(([id]) => id!));

/** Users who list English as a native language: skill level 5 in `eng_user_languages` (language, level, username, details). */
export const parseNativeSpeakers = (tsv: string): Set<string> =>
  new Set(rows(tsv).filter(([, level, user]) => level === "5" && user && user !== NULL).map(([, , user]) => user!));

/**
 * The one translation of a Sentence: the lowest id whose owner is a native English speaker, otherwise the lowest id
 * (import-pipeline.md#tatoeba). Ids compare as numbers.
 */
export const chooseTranslation = (translations: string[], owner: (id: string) => string | null, natives: Set<string>): string => {
  const lowest = (ids: string[]) => ids.reduce((a, b) => (Number(b) < Number(a) ? b : a));
  const native = translations.filter((id) => natives.has(owner(id) ?? ""));
  return lowest(native.length ? native : translations);
};

/** One jpn_indices item: `headword(reading)(#entry)[sense]{surface}~`, everything after the headword optional. */
const ITEM = /^([^([{~]+)((?:\([^)]*\))*)(?:\[(\d+)\])?(?:\{([^}]*)\})?~?$/;

type Item = { headword: string; reading: string | null; entry: string | null; sense: number | null; surface: string };

const item = (raw: string): Item | null => {
  const m = ITEM.exec(raw);
  if (!m) return null;
  const parens = [...(m[2] ?? "").matchAll(/\(([^)]*)\)/g)].map((p) => p[1]!);
  const entry = parens.find((p) => p.startsWith("#"));
  const reading = parens.find((p) => !p.startsWith("#"));
  return {
    headword: m[1]!,
    reading: reading ?? null,
    entry: entry ? entry.slice(1) : null,
    sense: m[3] ? Number(m[3]) : null,
    surface: m[4] || m[1]!,
  };
};

/** The links one `jpn_indices` line states, each placed at its next appearance in `text`. An item that cannot be placed is dropped. */
export const parseIndexLine = (line: string, text: string): SentenceLink[] => {
  let cursor = 0;
  const links: SentenceLink[] = [];
  for (const raw of line.split(" ")) {
    const parsed = raw ? item(raw) : null;
    const start = parsed ? text.indexOf(parsed.surface, cursor) : -1;
    if (!parsed || start < 0) continue;
    cursor = start + parsed.surface.length;
    links.push({ entry: parsed.entry, form: parsed.headword, reading: parsed.reading, sense: parsed.sense, start, end: cursor });
  }
  return links;
};

/**
 * `jpn_indices` rows: English sentence id, Japanese sentence id, indexed text. A Japanese Sentence may have a line per
 * translation, so each is kept with its English id.
 */
export const parseIndices = (csv: string): Map<string, { english: string; line: string }[]> => {
  const byJapanese = new Map<string, { english: string; line: string }[]>();
  for (const [english, japanese, line] of rows(csv).filter((r) => r.length >= 3)) {
    byJapanese.set(japanese!, [...(byJapanese.get(japanese!) ?? []), { english: english!, line: line! }]);
  }
  return byJapanese;
};
