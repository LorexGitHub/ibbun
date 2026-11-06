import { randomUUID } from "node:crypto";
import type { JlptLevel } from "@mojibun/shared";
import type { Clock } from "../authoring/authoring.ts";
import type { Row, Store } from "../authoring/store.ts";
import type { LevelledTable } from "./schema.ts";

/** The derived-level process (docs/jlpt-levels.md#the-derived-level-process). Bump VERSION to force a full rebuild. */
export const PROCESS = "content-graph/levels";
export const VERSION = "1";

type Candidate = Row<"levelCandidate">;
type Lifecycle = { approval: string; retired: boolean };

const visible = (row: Lifecycle) => row.approval === "approved" && !row.retired;
const PRECEDENCE = { editorial: 0, list: 1, derived: 2 } as const;
const HARDNESS: Record<JlptLevel, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/** Editorial over List over Derived; within a kind, the newest. Null means Unlevelled. */
export const currentLevel = (candidates: readonly Candidate[]): JlptLevel | null => {
  const [best] = candidates
    .filter(visible)
    .sort((a, b) => PRECEDENCE[a.kind] - PRECEDENCE[b.kind] || b.id.localeCompare(a.id, "en"));
  return best ? best.level : null;
};

/** The one Derived rule: a jōyō Kanji (KANJIDIC2 grade 1–8) with no List candidate gets N1. */
export const derivedLevel = (grade: number | null, candidates: readonly Candidate[]): JlptLevel | null =>
  grade !== null && grade >= 1 && grade <= 8 && !candidates.some((c) => c.kind === "list" && visible(c)) ? "N1" : null;

export const hardest = (levels: readonly JlptLevel[]): JlptLevel | null =>
  levels.reduce<JlptLevel | null>((max, l) => (max === null || HARDNESS[l] > HARDNESS[max] ? l : max), null);

/** Highest current level among linked Words and Grammar Points; Unlevelled Words are ignored and counted. */
export const computedLevel = (words: ReadonlyMap<string, JlptLevel | null>, grammar: readonly (JlptLevel | null)[]) => ({
  level: hardest([...words.values(), ...grammar].filter((l): l is JlptLevel => l !== null)),
  unlevelledWordCount: [...words.values()].filter((l) => l === null).length,
});

/** Inputs that changed since the last rebuild. Omit for a full rebuild. */
export type Changed = { studyItemIds?: readonly string[]; sentenceIds?: readonly string[] };
export type RebuildResult = { full: boolean; changedLevels: number; derivedAdded: number; derivedRetired: number; disagreements: number };

export interface Levels {
  /** Rebuilds the cache for what changed; in full when `changed` is omitted or the process version changed. */
  rebuild(changed?: Changed): Promise<RebuildResult>;
}

const defaultClock: Clock = { now: () => new Date(), newId: randomUUID };

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};

export const levels = (root: Store, clock: Clock = defaultClock): Levels => ({
  rebuild: (changed) => root.atomically((store) => rebuild(store, clock, changed)),
});

const processProvenance = async (store: Store, clock: Clock) => {
  const [state] = await store.rows("levelProcess", { process: PROCESS });
  if (state?.version === VERSION) return { provenanceId: state.provenanceId, versionChanged: false };
  const provenanceId = clock.newId();
  await store.insert("provenance", [
    { id: provenanceId, source: { kind: "derived", process: PROCESS, version: VERSION }, licence: "edrdg", author: null, sourceUrl: null, inputs: [] },
  ]);
  if (state) await store.update("levelProcess", { process: PROCESS }, { version: VERSION, provenanceId });
  else await store.insert("levelProcess", [{ process: PROCESS, version: VERSION, provenanceId }]);
  return { provenanceId, versionChanged: true };
};

type Ctx = {
  store: Store;
  clock: Clock;
  provenanceId: string;
  full: boolean;
  scope: Set<string>;
  live: Set<string>;
  byItem: Map<string, Candidate[]>;
  cached: Map<string, Row<"computedLevel">>;
  result: RebuildResult;
};

const load = (store: Store) =>
  Promise.all([
    store.rows("studyItem"),
    store.rows("kanji"),
    store.rows("levelCandidate"),
    store.rows("sentenceUsesWord"),
    store.rows("sentenceDemonstratesGrammar"),
    store.rows("passageContainsSentence"),
    store.rows("clipVoicesSentence"),
    store.rows("readingPassage"),
    store.rows("studyItem", { type: "listening_clip" }),
    store.rows("computedLevel"),
    store.rows("queueEntry", { reason: "level disagreement" }),
  ]);

const context = (
  store: Store,
  clock: Clock,
  provenanceId: string,
  full: boolean,
  items: readonly Row<"studyItem">[],
  candidates: readonly Candidate[],
  cache: readonly Row<"computedLevel">[],
  changedItems: readonly string[],
): Ctx => ({
  store,
  clock,
  provenanceId,
  full,
  scope: new Set(full ? items.map((i) => i.id) : changedItems),
  live: new Set(items.filter(visible).map((i) => i.id)),
  byItem: groupBy(candidates, (c) => c.studyItemId),
  cached: new Map(cache.map((c) => [c.recordId, c])),
  result: { full, changedLevels: 0, derivedAdded: 0, derivedRetired: 0, disagreements: 0 },
});

const rebuild = async (store: Store, clock: Clock, changed?: Changed): Promise<RebuildResult> => {
  const { provenanceId, versionChanged } = await processProvenance(store, clock);
  const full = !changed || versionChanged;
  const [items, kanji, candidates, usesWord, demonstrates, inPassage, inClip, passages, clips, cache, queue] = await load(store);
  const ctx = context(store, clock, provenanceId, full, items, candidates, cache, changed?.studyItemIds ?? []);
  const grades = new Map(kanji.map((k) => [k.studyItemId, k.grade] as const));
  for (const id of ctx.scope) await derive(ctx, id, grades.get(id) ?? null);
  const clipIds = clips.map((c) => c.id);
  await levelStudyItems(ctx, clipIds, queue);
  const sentenceLevel = levelOfSentences(ctx, usesWord, demonstrates);
  const touched = await levelSentences(ctx, sentenceLevel, [...usesWord, ...demonstrates], changed?.sentenceIds ?? []);
  await levelContainers(ctx, sentenceLevel, touched, groupBy(inPassage.filter(visible), (l) => l.passageId), passages.map((p) => p.id), "reading_passage");
  await levelContainers(ctx, sentenceLevel, touched, groupBy(inClip.filter(visible), (l) => l.clipId), clipIds, "listening_clip");
  return ctx.result;
};

/** Converges an item's Derived candidates to what the rule wants under this process version. */
const derive = async (ctx: Ctx, id: string, grade: number | null) => {
  const own = ctx.byItem.get(id) ?? [];
  const want = ctx.live.has(id) ? derivedLevel(grade, own) : null;
  const derived = own.filter((c) => c.kind === "derived" && !c.retired);
  for (const c of derived.filter((c) => c.provenanceId !== ctx.provenanceId || c.level !== want)) {
    await ctx.store.update("levelCandidate", { id: c.id }, { retired: true });
    c.retired = true;
    ctx.result.derivedRetired++;
  }
  if (!want || derived.some((c) => !c.retired)) return;
  const row: Candidate = { id: ctx.clock.newId(), studyItemId: id, level: want, kind: "derived", approval: "approved", retired: false, provenanceId: ctx.provenanceId };
  await ctx.store.insert("levelCandidate", [row]);
  ctx.byItem.set(id, [...own, row]);
  ctx.result.derivedAdded++;
};

const levelOf = (ctx: Ctx, id: string) => (ctx.live.has(id) ? currentLevel(ctx.byItem.get(id) ?? []) : null);

const write = async (ctx: Ctx, recordId: string, recordTable: LevelledTable, level: JlptLevel | null, unlevelledWordCount: number) => {
  const before = ctx.cached.get(recordId);
  if (before && before.level === level && before.unlevelledWordCount === unlevelledWordCount) return;
  if (before) await ctx.store.update("computedLevel", { recordId }, { level, unlevelledWordCount });
  else await ctx.store.insert("computedLevel", [{ recordId, recordTable, level, unlevelledWordCount }]);
  ctx.cached.set(recordId, { recordId, recordTable, level, unlevelledWordCount });
  if (before?.level !== level) ctx.result.changedLevels++;
};

/** Caches the current level and queues each List level that disagrees with it, once. */
const levelStudyItem = async (ctx: Ctx, id: string, queued: Set<string>) => {
  const level = levelOf(ctx, id);
  await write(ctx, id, "study_item", level, 0);
  const lists = (ctx.byItem.get(id) ?? []).filter((c) => c.kind === "list" && visible(c) && c.level !== level && ctx.live.has(id));
  for (const list of new Set(lists.map((c) => c.level))) {
    const detail = { list, current: level };
    const key = JSON.stringify([id, detail]);
    if (queued.has(key)) continue;
    queued.add(key);
    await ctx.store.insert("queueEntry", [
      { id: ctx.clock.newId(), reason: "level disagreement", recordId: id, importRunId: null, generationRunId: null, generationRequestId: null, detail, resolved: false, at: ctx.clock.now() },
    ]);
    ctx.result.disagreements++;
  }
};

const levelOfSentences = (ctx: Ctx, usesWord: readonly Row<"sentenceUsesWord">[], demonstrates: readonly Row<"sentenceDemonstratesGrammar">[]) => {
  const wordsOf = groupBy(usesWord.filter((l) => visible(l) && ctx.live.has(l.wordId)), (l) => l.sentenceId);
  const grammarOf = groupBy(demonstrates.filter((l) => visible(l) && ctx.live.has(l.grammarPointId)), (l) => l.sentenceId);
  return (sentenceIds: readonly string[]) => {
    const words = new Map<string, JlptLevel | null>();
    const grammar: (JlptLevel | null)[] = [];
    for (const s of sentenceIds) {
      for (const w of wordsOf.get(s) ?? []) words.set(w.wordId, levelOf(ctx, w.wordId));
      for (const g of grammarOf.get(s) ?? []) grammar.push(levelOf(ctx, g.grammarPointId));
    }
    return computedLevel(words, grammar);
  };
};

type SentenceLevel = ReturnType<typeof levelOfSentences>;
type Link = { sentenceId: string } & ({ wordId: string } | { grammarPointId: string });

/** Levels the Sentences in scope; returns them, or null when every Sentence was levelled. */
const levelSentences = async (ctx: Ctx, sentenceLevel: SentenceLevel, links: readonly Link[], changedSentences: readonly string[]) => {
  const linked = links.filter((l) => ctx.scope.has("wordId" in l ? l.wordId : l.grammarPointId)).map((l) => l.sentenceId);
  const touched = ctx.full ? null : new Set([...changedSentences, ...linked]);
  const sentences = touched ? (await Promise.all([...touched].map((id) => ctx.store.rows("sentence", { id })))).flat() : await ctx.store.rows("sentence");
  for (const s of sentences) {
    const { level, unlevelledWordCount } = sentenceLevel([s.id]);
    await write(ctx, s.id, "sentence", level, unlevelledWordCount);
    if (s.unlevelledWordCount !== unlevelledWordCount) await ctx.store.update("sentence", { id: s.id }, { unlevelledWordCount });
  }
  return touched;
};

/** Levels Reading Passages or Listening Clips that hold a touched Sentence (all of them when `touched` is null). */
const levelContainers = async (
  ctx: Ctx,
  sentenceLevel: SentenceLevel,
  touched: Set<string> | null,
  members: Map<string, { sentenceId: string }[]>,
  ids: readonly string[],
  table: LevelledTable,
) => {
  for (const id of ids) {
    const sentenceIds = (members.get(id) ?? []).map((l) => l.sentenceId);
    if (touched && !sentenceIds.some((s) => touched.has(s))) continue;
    const { level, unlevelledWordCount } = sentenceLevel(sentenceIds);
    await write(ctx, id, table, level, unlevelledWordCount);
  }
};

/** Every Study Item in scope but Listening Clips, which take the level of their Sentences. */
const levelStudyItems = async (ctx: Ctx, clipIds: readonly string[], queue: readonly Row<"queueEntry">[]) => {
  const queued = new Set(queue.map((q) => JSON.stringify([q.recordId, q.detail])));
  for (const id of ctx.scope) if (!clipIds.includes(id)) await levelStudyItem(ctx, id, queued);
};
