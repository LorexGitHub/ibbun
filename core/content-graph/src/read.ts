import type { JlptLevel, StudyItemId } from "@mojibun/shared";
import type { Graph } from "./graph.ts";
import type { Approval, ComprehensionQuestion, GrammarForm, Token } from "./schema.ts";

export type BrowsableType = "kanji" | "word" | "grammar_point";

/** One line of a level list or a search result. */
export type StudyItemSummary = {
  id: StudyItemId;
  type: BrowsableType;
  level: JlptLevel | null;
  label: string;
  reading: string | null;
  meaning: string | null;
};

type Common = { id: StudyItemId; level: JlptLevel | null };

export type Kanji = Common & {
  type: "kanji";
  literal: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  grade: number | null;
  frequency: number | null;
  strokeCount: number;
  components: string[];
  strokes: string[];
  knownWrongMeanings: { answer: string; explanation: string }[];
};

export type Word = Common & {
  type: "word";
  priorityTags: string[];
  forms: { id: string; text: string }[];
  readings: { id: string; text: string; pitchAccent: number[] | null }[];
  senses: { id: string; partsOfSpeech: string[]; glosses: string[]; japaneseExplanation: string | null }[];
};

export type GrammarPoint = Common & {
  type: "grammar_point";
  title: string;
  forms: GrammarForm[];
  formation: string[];
  register: "casual" | "neutral" | "polite" | "formal";
  meaning: string;
  japaneseExplanation: string | null;
  notes: string | null;
};

export type ListeningClip = Common & { type: "listening_clip"; kind: "sentence" | "dialogue" };

export type StudyItem = Kanji | Word | GrammarPoint | ListeningClip;

export type Sentence = {
  id: string;
  text: string;
  translationEn: string | null;
  tokens: Token[];
  audio: { key: string; voice: string | null } | null;
};

export type Example = {
  id: string;
  sentence: Sentence;
  target: { start: number; end: number };
  targetSenseId: string | null;
  hint: string | null;
  comprehensionQuestion: ComprehensionQuestion | null;
  accepted: { id: string; written: string; reading: string | null }[];
  alternates: { id: string; written: string; message: string | null }[];
  knownWrong: { id: string; written: string; message: string | null }[];
};

export type StudyItemLink =
  | { kind: "contains_kanji"; position: number; kanji: StudyItemSummary }
  | { kind: "contained_in_word"; position: number; word: StudyItemSummary }
  | { kind: "relates_to"; relation: "see_also" | "contrast"; comparison: string | null; grammarPoint: StudyItemSummary }
  | { kind: "voices"; position: number; speaker: "男" | "女"; voice: string; audioKey: string | null; sentence: Sentence };

/** What a Browse page shows: the Study Item, its Examples and its links. */
export type StudyItemPage = { item: StudyItem; examples: Example[]; links: StudyItemLink[] };

/** Reads of approved, non-retired Content Graph records with overrides applied. */
export interface ContentGraph {
  studyItem(id: StudyItemId): Promise<StudyItemPage | null>;
  /** Visible Study Items of one type whose current JLPT Level is `level`. */
  levelList(level: JlptLevel, type: BrowsableType): Promise<StudyItemSummary[]>;
  /** By written form, reading or meaning. Exact matches first, then prefix matches, then the rest. */
  search(query: string, options?: { limit?: number }): Promise<StudyItemSummary[]>;
}

export const DEFAULT_SEARCH_LIMIT = 50;
const LEVEL_PRECEDENCE = { editorial: 0, list: 1, derived: 2 } as const;

type Lifecycle = { approval: Approval; retired: boolean };
type Row<K extends keyof Graph> = Graph[K][number];

const visible = (row: Lifecycle) => row.approval === "approved" && !row.retired;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en");
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const present = <T>(value: T | null | undefined): value is T => value != null;

export const normaliseQuery = (query: string) => query.trim().toLowerCase();

/** Exact 0, prefix 1, anywhere 2; null when `text` does not match. */
export const matchTier = (text: string, query: string): number | null => {
  const t = text.toLowerCase();
  if (t === query) return 0;
  if (t.startsWith(query)) return 1;
  return t.includes(query) ? 2 : null;
};

/** The rows a read works over, with the newest active override of each field folded in by `current`. */
type Ctx = { graph: Graph; overrides: Map<string, Record<string, unknown>>; items: Map<string, Row<"studyItem">> };

const context = (graph: Graph): Ctx => {
  const overrides = new Map<string, Record<string, unknown>>();
  for (const o of graph.override.filter((o) => visible(o) && o.state === "active").sort(byId)) {
    overrides.set(o.recordId, { ...overrides.get(o.recordId), [o.field]: o.value });
  }
  return { graph, overrides, items: new Map(graph.studyItem.filter(visible).map((s) => [s.id, s])) };
};

const current = <T extends object>(ctx: Ctx, row: T, recordId: string): T => ({ ...row, ...ctx.overrides.get(recordId) });

/** Editorial over List over Derived; within a kind, the newest. */
const levelOf = (ctx: Ctx, id: string): JlptLevel | null => {
  const [best] = ctx.graph.levelCandidate
    .filter((c) => c.studyItemId === id && visible(c))
    .sort((a, b) => LEVEL_PRECEDENCE[a.kind] - LEVEL_PRECEDENCE[b.kind] || byId(b, a));
  return best ? best.level : null;
};

/** The newest visible Japanese Explanation that `matches`. */
const explanation = (ctx: Ctx, matches: (e: Row<"japaneseExplanation">) => boolean) => {
  const newest = ctx.graph.japaneseExplanation.filter((e) => visible(e) && matches(e)).sort(byId).at(-1);
  return newest ? current(ctx, newest, newest.id).text : null;
};

const subEntries = <R extends Lifecycle & { id: string; wordId: string; position: number }>(ctx: Ctx, rows: R[], wordId: string) =>
  rows.filter((r) => r.wordId === wordId && visible(r)).sort(byPosition).map((r) => current(ctx, r, r.id));

const kanjiOf = (ctx: Ctx, id: StudyItemId): Kanji | null => {
  const row = ctx.graph.kanji.find((k) => k.studyItemId === id);
  if (!row) return null;
  const { studyItemId: _, ...fields } = current(ctx, row, id);
  return { type: "kanji", id, level: levelOf(ctx, id), ...fields };
};

const wordOf = (ctx: Ctx, id: StudyItemId): Word | null => {
  const row = ctx.graph.word.find((w) => w.studyItemId === id);
  if (!row) return null;
  return {
    type: "word",
    id,
    level: levelOf(ctx, id),
    priorityTags: current(ctx, row, id).priorityTags,
    forms: subEntries(ctx, ctx.graph.wordForm, id).map(({ id, text }) => ({ id, text })),
    readings: subEntries(ctx, ctx.graph.wordReading, id).map(({ id, text, pitchAccent }) => ({ id, text, pitchAccent })),
    senses: subEntries(ctx, ctx.graph.wordSense, id).map(({ id, partsOfSpeech, glosses }) => ({
      id,
      partsOfSpeech,
      glosses,
      japaneseExplanation: explanation(ctx, (e) => e.wordSenseId === id),
    })),
  };
};

const grammarPointOf = (ctx: Ctx, id: StudyItemId): GrammarPoint | null => {
  const row = ctx.graph.grammarPoint.find((g) => g.studyItemId === id);
  if (!row) return null;
  const { studyItemId: _, matcherRule: __, ...fields } = current(ctx, row, id);
  return { type: "grammar_point", id, level: levelOf(ctx, id), ...fields, japaneseExplanation: explanation(ctx, (e) => e.grammarPointId === id) };
};

const listeningClipOf = (ctx: Ctx, id: StudyItemId): ListeningClip | null => {
  const row = ctx.graph.listeningClip.find((c) => c.studyItemId === id);
  return row ? { type: "listening_clip", id, level: levelOf(ctx, id), kind: current(ctx, row, id).kind } : null;
};

const BUILD = { kanji: kanjiOf, word: wordOf, grammar_point: grammarPointOf, listening_clip: listeningClipOf } as const;

const itemOf = (ctx: Ctx, id: string): StudyItem | null => {
  const row = ctx.items.get(id);
  return row ? BUILD[row.type](ctx, row.id as StudyItemId) : null;
};

type ByType<R> = { [K in StudyItem["type"]]: (item: Extract<StudyItem, { type: K }>) => R };
const byType = <R>(table: ByType<R>, item: StudyItem): R => (table[item.type] as (item: StudyItem) => R)(item);

type SummaryFields = Pick<StudyItemSummary, "label" | "reading" | "meaning">;
const SUMMARY: ByType<SummaryFields | null> = {
  kanji: (k) => ({ label: k.literal, reading: [...k.onReadings, ...k.kunReadings][0] ?? null, meaning: k.meanings[0] ?? null }),
  word: (w) => ({ label: w.forms[0]?.text ?? w.readings[0]?.text ?? "", reading: w.readings[0]?.text ?? null, meaning: w.senses[0]?.glosses[0] ?? null }),
  grammar_point: (g) => ({ label: g.title, reading: null, meaning: g.meaning }),
  listening_clip: () => null,
};

const summaryOf = (item: StudyItem | null): StudyItemSummary | null => {
  const fields = item && byType(SUMMARY, item);
  return fields && { id: item.id, type: item.type as BrowsableType, level: item.level, ...fields };
};

const sentenceOf = (ctx: Ctx, id: string): Sentence | null => {
  const row = ctx.graph.sentence.find((s) => s.id === id && visible(s));
  if (!row) return null;
  const s = current(ctx, row, row.id);
  return { id: s.id, text: s.text, translationEn: s.translationEn, tokens: s.tokens, audio: s.audioKey ? { key: s.audioKey, voice: s.audioVoice } : null };
};

const answersOf = (ctx: Ctx, exampleId: string, kind: Row<"exampleAnswer">["kind"]) =>
  ctx.graph.exampleAnswer
    .filter((a) => a.exampleId === exampleId && a.kind === kind && visible(a))
    .sort(byId)
    .map((a) => current(ctx, a, a.id));

const exampleOf = (ctx: Ctx, row: Row<"example">): Example | null => {
  const e = current(ctx, row, row.id);
  const sentence = sentenceOf(ctx, e.sentenceId);
  return (
    sentence && {
      id: e.id,
      sentence,
      target: { start: e.spanStart, end: e.spanEnd },
      targetSenseId: e.targetSenseId,
      hint: e.hint,
      comprehensionQuestion: e.comprehensionQuestion,
      accepted: answersOf(ctx, e.id, "accepted").map(({ id, written, reading }) => ({ id, written, reading })),
      alternates: answersOf(ctx, e.id, "alternate").map(({ id, written, message }) => ({ id, written, message })),
      knownWrong: answersOf(ctx, e.id, "known_wrong").map(({ id, written, message }) => ({ id, written, message })),
    }
  );
};

const examplesOf = (ctx: Ctx, id: string): Example[] =>
  ctx.graph.example
    .filter((e) => e.studyItemId === id && visible(e))
    .sort(byId)
    .map((e) => exampleOf(ctx, e))
    .filter(present);

/** Visible links of `rows` that `mine` selects, each turned into a page link, or dropped when its far end is invisible. */
const linked = <R extends Lifecycle & { id: string }>(
  rows: R[],
  mine: (r: R) => boolean,
  order: (a: R, b: R) => number,
  toLink: (r: R) => StudyItemLink | null,
) => rows.filter((r) => mine(r) && visible(r)).sort(order).map(toLink).filter(present);

const linksOf = (ctx: Ctx, item: StudyItem): StudyItemLink[] => {
  const summary = (id: string) => summaryOf(itemOf(ctx, id));
  const links: ByType<StudyItemLink[]> = {
    word: (w) =>
      linked(ctx.graph.wordContainsKanji, (l) => l.wordId === w.id, byPosition, (l) => {
        const kanji = summary(l.kanjiId);
        return kanji && { kind: "contains_kanji", position: l.position, kanji };
      }),
    kanji: (k) =>
      linked(ctx.graph.wordContainsKanji, (l) => l.kanjiId === k.id, byId, (l) => {
        const word = summary(l.wordId);
        return word && { kind: "contained_in_word", position: l.position, word };
      }),
    grammar_point: (g) =>
      linked(ctx.graph.grammarRelatesTo, (l) => l.fromId === g.id, byId, (l) => {
        const grammarPoint = summary(l.toId);
        return grammarPoint && { kind: "relates_to", relation: l.kind, comparison: l.comparison, grammarPoint };
      }),
    listening_clip: (c) =>
      linked(ctx.graph.clipVoicesSentence, (l) => l.clipId === c.id, byPosition, (l) => {
        const sentence = sentenceOf(ctx, l.sentenceId);
        return sentence && { kind: "voices", position: l.position, speaker: l.speaker, voice: l.voice, audioKey: l.audioKey, sentence };
      }),
  };
  return byType(links, item);
};

/** Must match the `search_text` view in the migration: the contract tests hold the two together. */
const SEARCH_TEXTS: ByType<string[]> = {
  kanji: (k) => [k.literal, ...k.meanings, ...k.onReadings, ...k.kunReadings],
  word: (w) => [...w.forms.map((f) => f.text), ...w.readings.map((r) => r.text), ...w.senses.flatMap((s) => s.glosses)],
  grammar_point: (g) => [g.title, g.meaning],
  listening_clip: () => [],
};

const bestTier = (item: StudyItem, query: string) =>
  Math.min(...byType(SEARCH_TEXTS, item).map((text) => matchTier(text, query) ?? Infinity));

/** The pure reads over a set of rows. The fake runs it over its whole graph; Postgres over the rows a read loaded. */
export const reader = (graph: Graph) => {
  const ctx = context(graph);
  const visibleItems = () => [...ctx.items.keys()].map((id) => itemOf(ctx, id)).filter(present);
  return {
    studyItem(id: string): StudyItemPage | null {
      const item = itemOf(ctx, id);
      return item && { item, examples: examplesOf(ctx, id), links: linksOf(ctx, item) };
    },

    levelList(level: JlptLevel, type: BrowsableType): StudyItemSummary[] {
      return visibleItems()
        .filter((item) => item.type === type && item.level === level)
        .sort(byId)
        .map(summaryOf)
        .filter(present);
    },

    search(query: string, limit = DEFAULT_SEARCH_LIMIT): StudyItemSummary[] {
      const q = normaliseQuery(query);
      if (!q) return [];
      return visibleItems()
        .map((item) => ({ item, tier: bestTier(item, q) }))
        .filter((m) => m.tier !== Infinity)
        .sort((a, b) => a.tier - b.tier || byId(a.item, b.item))
        .slice(0, limit)
        .map((m) => summaryOf(m.item))
        .filter(present);
    },
  };
};
