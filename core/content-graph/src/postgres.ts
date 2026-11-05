import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@mojibun/db";
import { emptyGraph, type Graph } from "./graph.ts";
import { DEFAULT_SEARCH_LIMIT, normaliseQuery, reader, type ContentGraph } from "./read.ts";
import * as t from "./schema.ts";

/**
 * The read interface over Postgres. Each read finds its candidate Study Items in
 * SQL, loads their rows, and hands them to the same pure `reader` the fake uses.
 */
export const createContentGraph = (db: DbOrTx): ContentGraph => ({
  async studyItem(id) {
    return reader(await loadPage(db, id)).studyItem(id);
  },

  async levelList(level, type) {
    const ids = await db
      .selectDistinct({ id: t.studyItem.id })
      .from(t.studyItem)
      .innerJoin(t.levelCandidate, eq(t.levelCandidate.studyItemId, t.studyItem.id))
      .where(and(eq(t.studyItem.type, type), eq(t.levelCandidate.level, level), visible(t.studyItem), visible(t.levelCandidate)));
    return reader(await loadItems(db, ids.map((r) => r.id))).levelList(level, type);
  },

  async search(query, options) {
    const q = normaliseQuery(query);
    if (!q) return [];
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { rows } = await db.execute<{ study_item_id: string }>(sql`
      SELECT study_item_id,
             min(CASE WHEN lower(text) = ${q} THEN 0 WHEN lower(text) LIKE ${like} || '%' THEN 1 ELSE 2 END) AS tier
      FROM content_graph.search_text
      WHERE lower(text) LIKE '%' || ${like} || '%'
      GROUP BY study_item_id
      ORDER BY tier, study_item_id
      LIMIT ${limit}`);
    return reader(await loadItems(db, rows.map((r) => r.study_item_id))).search(q, limit);
  },
});

const visible = (table: { approval: PgColumn; retired: PgColumn }) =>
  and(eq(table.approval, "approved"), eq(table.retired, false));

const unique = (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => id !== null))];

/** The rows a summary or a Study Item needs: the item, its details, sub-entries, explanations, Level Candidates and overrides. */
const loadItems = async (db: DbOrTx, ids: string[], graph: Graph = emptyGraph()): Promise<Graph> => {
  const [studyItem, kanji, word, grammarPoint, listeningClip, wordForm, wordReading, wordSense, levelCandidate] = await Promise.all([
    db.select().from(t.studyItem).where(inArray(t.studyItem.id, ids)),
    db.select().from(t.kanji).where(inArray(t.kanji.studyItemId, ids)),
    db.select().from(t.word).where(inArray(t.word.studyItemId, ids)),
    db.select().from(t.grammarPoint).where(inArray(t.grammarPoint.studyItemId, ids)),
    db.select().from(t.listeningClip).where(inArray(t.listeningClip.studyItemId, ids)),
    db.select().from(t.wordForm).where(inArray(t.wordForm.wordId, ids)),
    db.select().from(t.wordReading).where(inArray(t.wordReading.wordId, ids)),
    db.select().from(t.wordSense).where(inArray(t.wordSense.wordId, ids)),
    db.select().from(t.levelCandidate).where(inArray(t.levelCandidate.studyItemId, ids)),
  ]);
  const senseIds = wordSense.map((s) => s.id);
  const japaneseExplanation = await db
    .select()
    .from(t.japaneseExplanation)
    .where(or(inArray(t.japaneseExplanation.wordSenseId, senseIds), inArray(t.japaneseExplanation.grammarPointId, ids)));
  const loaded = { ...graph, studyItem, kanji, word, grammarPoint, listeningClip, wordForm, wordReading, wordSense, levelCandidate, japaneseExplanation };
  return withOverrides(db, loaded);
};

/** The rows a Browse page needs: the item, its Examples with Sentences and answers, and its links with what they point at. */
const loadPage = async (db: DbOrTx, id: string): Promise<Graph> => {
  const [example, wordContainsKanji, grammarRelatesTo, clipVoicesSentence] = await Promise.all([
    db.select().from(t.example).where(eq(t.example.studyItemId, id)),
    db.select().from(t.wordContainsKanji).where(or(eq(t.wordContainsKanji.wordId, id), eq(t.wordContainsKanji.kanjiId, id))),
    db.select().from(t.grammarRelatesTo).where(eq(t.grammarRelatesTo.fromId, id)),
    db.select().from(t.clipVoicesSentence).where(eq(t.clipVoicesSentence.clipId, id)),
  ]);
  const [exampleAnswer, sentence] = await Promise.all([
    db.select().from(t.exampleAnswer).where(inArray(t.exampleAnswer.exampleId, example.map((e) => e.id))),
    db.select().from(t.sentence).where(inArray(t.sentence.id, unique([...example, ...clipVoicesSentence].map((r) => r.sentenceId)))),
  ]);
  const ends = unique([id, ...wordContainsKanji.flatMap((l) => [l.wordId, l.kanjiId]), ...grammarRelatesTo.map((l) => l.toId)]);
  return loadItems(db, ends, { ...emptyGraph(), example, exampleAnswer, sentence, wordContainsKanji, grammarRelatesTo, clipVoicesSentence });
};

const withOverrides = async (db: DbOrTx, graph: Graph): Promise<Graph> => {
  const recordIds = unique([
    ...graph.studyItem,
    ...graph.wordForm,
    ...graph.wordReading,
    ...graph.wordSense,
    ...graph.japaneseExplanation,
    ...graph.example,
    ...graph.exampleAnswer,
    ...graph.sentence,
  ].map((r) => r.id));
  return { ...graph, override: await db.select().from(t.override).where(inArray(t.override.recordId, recordIds)) };
};
