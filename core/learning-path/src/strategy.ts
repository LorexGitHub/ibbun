import { createHash } from "node:crypto";
import type { PathItem } from "@ibbun/content-graph";
import type { StudyItemId } from "@ibbun/shared";
import { normaliseTracks, trackKey, trackOfItem, type Track } from "./track.ts";

/** Band sizes of the sort keys. Config, not code. */
export type Bands = {
  /** KANJIDIC2 `freq` ranks per Kanji band. */
  kanjiFrequency: number;
  /** JMdict `nfXX` tags per Word band. One tag is 500 Words. */
  wordNfTags: number;
};
export const DEFAULT_BANDS: Bands = { kanjiFrequency: 250, wordNfTags: 1 };

/** What a strategy orders over: the visible Study Items, the Learner's seed and what they have introduced. */
export type PathInput = { items: PathItem[]; seed: string; introduced: ReadonlySet<string> };

/** One Learner's Learning Path at one moment. */
export type Plan = {
  /** The next `n` items from the active Tracks, in rounds, each after its pulled-in dependencies. */
  next(active: Track[], n: number): StudyItemId[];
  /** The item after its pulled-in dependencies, for Learn now. Empty for an item that is not visible. */
  forItem(id: string): StudyItemId[];
  isLocked(id: string): boolean;
};

export type Strategy = (input: PathInput) => Plan;

/** Compared element by element. Every key of one type has the same length. */
type Key = number[];
const OTHER_PRIORITY = /^(news|ichi|spec|gai)\d$/;

const wordKey = (bands: Bands, item: PathItem): Key => {
  const nf = item.priorityTags.map((tag) => /^nf(\d+)$/.exec(tag)?.[1]).find((n) => n !== undefined);
  if (nf !== undefined) return [0, Math.ceil(Number(nf) / bands.wordNfTags)];
  return [item.priorityTags.some((tag) => OTHER_PRIORITY.test(tag)) ? 1 : 2, 0];
};

const kanjiKey = (bands: Bands, item: PathItem): Key => {
  if (item.frequency !== null) return [0, Math.floor((item.frequency - 1) / bands.kanjiFrequency)];
  return item.grade !== null ? [1, item.grade] : [2, 0];
};

const compareKeys = (a: Key, b: Key): number => {
  const i = a.findIndex((x, j) => x !== b[j]);
  return i < 0 ? 0 : a[i]! - b[i]!;
};

/** The per-Learner tie-break: stable for an item, so a new item never reshuffles the others. */
export const tieBreak = (seed: string, id: string) => createHash("sha256").update(`${seed}:${id}`).digest("hex");

type Graph = {
  byId: Map<string, PathItem>;
  /** Dependencies that are visible, not Suspended and at the item's level. */
  sameLevel: (item: PathItem, ids: string[]) => PathItem[];
};

const graphOf = (items: PathItem[]): Graph => {
  const byId = new Map(items.map((i) => [i.id as string, i]));
  const sameLevel = (item: PathItem, ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((d): d is PathItem => d !== undefined && !d.suspended && d.level === item.level);
  return { byId, sameLevel };
};

const keyOf = (bands: Bands, graph: Graph, item: PathItem): Key =>
  ({
    word: () => wordKey(bands, item),
    kanji: () => kanjiKey(bands, item),
    grammar_point: () => [graph.sameLevel(item, item.demonstrates).length],
    listening_clip: () => [],
  })[item.type]();

/** Each Track's items not yet introduced, in order. Suspended items are left out. */
const pendingByTrack = (bands: Bands, graph: Graph, { items, seed, introduced }: PathInput) => {
  const tracks = new Map<string, PathItem[]>();
  items
    .filter((i) => !i.suspended && !introduced.has(i.id))
    .map((item) => ({ item, key: keyOf(bands, graph, item), tie: tieBreak(seed, item.id) }))
    .sort((a, b) => compareKeys(a.key, b.key) || a.tie.localeCompare(b.tie))
    .forEach(({ item }) => {
      const key = trackKey(trackOfItem(item));
      tracks.set(key, [...(tracks.get(key) ?? []), item]);
    });
  return tracks;
};

/** The item, after each dependency not yet introduced or taken, depth first. Marks all of them taken. */
const puller = (graph: Graph, introduced: ReadonlySet<string>) => {
  const pull = (item: PathItem, taken: Set<string>): StudyItemId[] => {
    taken.add(item.id);
    const before: StudyItemId[] = [];
    for (const dep of graph.sameLevel(item, item.dependsOn)) {
      if (!introduced.has(dep.id) && !taken.has(dep.id)) before.push(...pull(dep, taken));
    }
    return [...before, item.id];
  };
  return pull;
};

/** Rounds over the queues, one item each, until `n` items are offered or every queue is empty. */
const roundRobin = (queues: PathItem[][], n: number, pull: (item: PathItem, taken: Set<string>) => StudyItemId[]) => {
  const taken = new Set<string>();
  const untaken = (q: PathItem[]) => q.filter((i) => !taken.has(i.id));
  const batch: StudyItemId[] = [];
  let live = queues;
  for (let offered = 0; offered < n && live.length > 0; live = live.map(untaken).filter((q) => q.length > 0)) {
    for (const queue of live) {
      const item = untaken(queue)[0];
      if (!item || offered === n) break;
      batch.push(...pull(item, taken));
      offered++;
    }
  }
  return batch;
};

/**
 * `frequency-v1` (docs/learning-path.md): Words by JMdict priority, Kanji by KANJIDIC2 frequency then grade, Grammar
 * Points by how much other same-level grammar their Examples need, Listening Clips by dependencies only.
 */
export const frequencyV1 =
  (bands: Bands): Strategy =>
  (input) => {
    const graph = graphOf(input.items);
    const pending = pendingByTrack(bands, graph, input);
    const pull = puller(graph, input.introduced);
    const nextIn = (item: PathItem) => pending.get(trackKey(trackOfItem(item)))?.[0];
    return {
      next: (active, n) => roundRobin(normaliseTracks(active).map((t) => pending.get(trackKey(t)) ?? []), n, pull),
      forItem(id) {
        const item = graph.byId.get(id);
        return item ? pull(item, new Set()) : [];
      },
      isLocked(id) {
        const item = graph.byId.get(id);
        return !item || (!input.introduced.has(id) && nextIn(item)?.id !== id);
      },
    };
  };

/** Every strategy version ever deployed. One config value picks the live one. */
export const STRATEGIES = { "frequency-v1": frequencyV1 } as const;
export type StrategyName = keyof typeof STRATEGIES;
