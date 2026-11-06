import type { Breaker, Counts, WordRecord } from "./types.ts";

type Sense = { partsOfSpeech: string[]; glosses: string[] };

const normalise = (gloss: string) => gloss.toLowerCase().replace(/\s+/g, " ").trim();

/** Part of speech plus normalised glosses, order-free. */
export const fingerprint = (sense: Sense) => JSON.stringify([[...sense.partsOfSpeech].sort(), sense.glosses.map(normalise).sort()]);

const words = (sense: Sense) => new Set(sense.glosses.flatMap((g) => normalise(g).split(" ")));

/** Jaccard similarity of the gloss words. */
export const similarity = (a: Sense, b: Sense) => {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared);
};

/** For each new sense, the index of the old sense it keeps the ID of, or null: fingerprint first, then closest similarity at or above `threshold`. */
export const matchSenses = (old: Sense[], next: Sense[], threshold: number): (number | null)[] => {
  const used = new Set<number>();
  const take = (i: number) => (used.add(i), i);
  const exact = next.map((s) => {
    const i = old.findIndex((o, j) => !used.has(j) && fingerprint(o) === fingerprint(s));
    return i < 0 ? null : take(i);
  });
  return exact.map((match, n) => {
    if (match !== null) return match;
    const best = old
      .map((o, i) => ({ i, score: similarity(o, next[n]!) }))
      .filter(({ i, score }) => !used.has(i) && score >= threshold)
      .sort((a, b) => b.score - a.score)[0];
    return best ? take(best.i) : null;
  });
};

/** Every (written form, reading) pair; a kana-only entry pairs its readings with nothing. */
export const pairs = (forms: string[], readings: string[]) =>
  forms.length ? forms.flatMap((f) => readings.map((r) => `${f}|${r}`)) : readings.map((r) => `|${r}`);

/** The surviving entry every pair of a gone entry now appears in, if each pair appears in exactly one entry and it is the same one. */
export const successorKey = (gonePairs: string[], surviving: WordRecord[]): string | null => {
  const owners = new Map<string, Set<string>>();
  for (const record of surviving) {
    for (const p of pairs(record.forms, record.readings.map((r) => r.text))) owners.set(p, (owners.get(p) ?? new Set()).add(record.key));
  }
  const keys = new Set<string>();
  for (const p of gonePairs) {
    const found = owners.get(p);
    if (found?.size !== 1) return null;
    keys.add([...found][0]!);
  }
  return keys.size === 1 ? [...keys][0]! : null;
};

/** The moved span of `target` in `text` when it appears there exactly once, else null. */
export const moveSpan = (target: string, text: string): { spanStart: number; spanEnd: number } | null => {
  const at = text.indexOf(target);
  if (!target || at < 0 || text.indexOf(target, at + 1) >= 0) return null;
  return { spanStart: at, spanEnd: at + target.length };
};

/** Which circuit-breaker rules a run's counts break, against `total` records the dataset held before it. */
export const tripped = (counts: Counts, total: number, breaker: Breaker): string[] =>
  [
    counts.changed + counts.retired > total * breaker.maxChangedShare && "changed share",
    counts.approvedExamplesRedrafted > breaker.maxExamplesRedrafted && "examples redrafted",
    counts.retiredLevelledWithoutSuccessor > 0 && "levelled item retired without successor",
    counts.levelsChanged > breaker.maxLevelChanges && "level changes",
  ].filter((reason): reason is string => reason !== false);
