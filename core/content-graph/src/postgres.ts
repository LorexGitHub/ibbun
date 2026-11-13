import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@ibbun/db";
import type { JlptLevel, StudyItemId } from "@ibbun/shared";
import { emptyGraph, type Graph } from "./graph.ts";
import { creditsOf, recordProvenance } from "./licensing.ts";
import { DEFAULT_SEARCH_LIMIT, normaliseQuery, reader, type ContentGraph } from "./read.ts";
import * as t from "./schema.ts";

/**
 * The read interface over Postgres. Each read finds its candidate Study Items in
 * SQL, loads their rows, and hands them to the same pure `reader` the fake uses.
 */
export const createContentGraph = (db: DbOrTx): ContentGraph => ({
  async studyItem(id) {
    return (await readerOver(db, await loadPage(db, id))).studyItem(id);
  },

  async readingPassage(id) {
    return (await readerOver(db, await loadPassage(db, id))).readingPassage(id);
  },

  async successorOf(id) {
    const [link] = await db
      .select({ id: t.wordSupersededBy.wordId })
      .from(t.wordSupersededBy)
      .innerJoin(t.studyItem, eq(t.studyItem.id, t.wordSupersededBy.wordId))
      .where(and(eq(t.wordSupersededBy.retiredWordId, id), visible(t.wordSupersededBy), visible(t.studyItem)))
      .orderBy(t.wordSupersededBy.id)
      .limit(1);
    return (link?.id as StudyItemId | undefined) || null;
  },

  async levelList(level, type) {
    return (await readerOver(db, await loadItems(db, await candidateIds(db, level, type)))).levelList(level, type);
  },

  async listeningClips(level) {
    return (await readerOver(db, await loadItems(db, await candidateIds(db, level, "listening_clip")))).listeningClips(level);
  },

  async atLevel(ids, level) {
    return (await readerOver(db, await loadItems(db, [...ids]))).atLevel(ids, level);
  },

  async search(query, { limit = DEFAULT_SEARCH_LIMIT } = {}) {
    const q = normaliseQuery(query);
    if (!q) return [];
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { rows } = await db.execute<{ study_item_id: string }>(sql`
      SELECT study_item_id,
             min(CASE WHEN lower(text) = ${q} THEN 0 WHEN lower(text) LIKE ${like} || '%' THEN 1 ELSE 2 END) AS tier
      FROM content_graph.search_text
      WHERE lower(text) LIKE '%' || ${like} || '%'
      GROUP BY study_item_id
      ORDER BY tier, study_item_id
      LIMIT ${limit}`);
    return (await readerOver(db, await loadItems(db, rows.map((r) => r.study_item_id)))).search(q, limit);
  },

  async credits() {
    const [importRun, provenance] = await Promise.all([
      db.select().from(t.importRun).where(isNotNull(t.importRun.appliedAt)),
      db.select().from(t.provenance).where(eq(t.provenance.licence, "voicevox")),
    ]);
    return creditsOf({ importRun, provenance });
  },

  async pathItems() {
    return reader(await loadPath(db), new Map()).pathItems();
  },
});

/** The visible Study Items of `type` with a visible Level Candidate at `level`; the reader then settles the current level. */
const candidateIds = async (db: DbOrTx, level: JlptLevel, type: t.StudyItemType) =>
  (
    await db
      .selectDistinct({ id: t.studyItem.id })
      .from(t.studyItem)
      .innerJoin(t.levelCandidate, eq(t.levelCandidate.studyItemId, t.studyItem.id))
      .where(and(eq(t.studyItem.type, type), eq(t.levelCandidate.level, level), visible(t.studyItem), visible(t.levelCandidate)))
  ).map((r) => r.id);

const PATH_SENTENCES = sql`(SELECT sentence_id FROM content_graph.example UNION SELECT sentence_id FROM content_graph.clip_voices_sentence)`;
const HEARD_SENTENCES = sql`(SELECT sentence_id FROM content_graph.clip_voices_sentence)`;
/** Every Study Item with a Level Candidate, and every Word a Listening Clip's Sentences use. */
const PATH_WORDS = sql`(SELECT study_item_id FROM content_graph.level_candidate UNION SELECT word_id FROM content_graph.sentence_uses_word WHERE sentence_id IN ${HEARD_SENTENCES})`;

/**
 * The visible rows the Learning Path reads: items, levels, first forms, Examples, Sentences and fact links.
 * A Word with no level that no clip uses stays in the database, with its forms, and so do the Sentences of no Example or clip:
 * the dictionary is twenty times the path. Every override comes along, since the path has more records than one query can name.
 */
const loadPath = async (db: DbOrTx): Promise<Graph> => {
  const [studyItem, levelCandidate, wordForm, example, sentence, wordContainsKanji, sentenceUsesWord, sentenceDemonstratesGrammar, clipVoicesSentence, kanji, word, override] =
    await Promise.all([
      db.select().from(t.studyItem).where(and(visible(t.studyItem), or(ne(t.studyItem.type, "word"), sql`${t.studyItem.id} IN ${PATH_WORDS}`))),
      db.select().from(t.levelCandidate).where(visible(t.levelCandidate)),
      db.select().from(t.wordForm).where(and(visible(t.wordForm), sql`${t.wordForm.wordId} IN ${PATH_WORDS}`)),
      db.select().from(t.example).where(visible(t.example)),
      db.select().from(t.sentence).where(and(visible(t.sentence), sql`${t.sentence.id} IN ${PATH_SENTENCES}`)),
      db.select().from(t.wordContainsKanji).where(and(visible(t.wordContainsKanji), sql`${t.wordContainsKanji.wordId} IN ${PATH_WORDS}`)),
      db.select().from(t.sentenceUsesWord).where(and(visible(t.sentenceUsesWord), sql`${t.sentenceUsesWord.sentenceId} IN ${HEARD_SENTENCES}`)),
      db.select().from(t.sentenceDemonstratesGrammar).where(and(visible(t.sentenceDemonstratesGrammar), sql`${t.sentenceDemonstratesGrammar.sentenceId} IN ${PATH_SENTENCES}`)),
      db.select().from(t.clipVoicesSentence).where(visible(t.clipVoicesSentence)),
      db.select().from(t.kanji),
      db.select().from(t.word).where(sql`${t.word.studyItemId} IN ${PATH_WORDS}`),
      db.select().from(t.override),
    ]);
  return { ...emptyGraph(), studyItem, levelCandidate, wordForm, example, sentence, wordContainsKanji, sentenceUsesWord, sentenceDemonstratesGrammar, clipVoicesSentence, kanji, word, override };
};

const visible = (table: { approval: PgColumn; retired: PgColumn }) =>
  and(eq(table.approval, "approved"), eq(table.retired, false));

/** drizzle's `inArray` overflows the stack past about 120,000 ids, so a long list is read a chunk at a time. */
const CHUNK = 1_000;
const inChunks = async <T>(ids: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> => {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) rows.push(...(await read(ids.slice(i, i + CHUNK))));
  return rows;
};

const unique = (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => id !== null))];

/** The rows a summary or a Study Item needs: the item, its details, sub-entries, explanations, Level Candidates and overrides. */
const loadItems = async (db: DbOrTx, ids: string[], graph: Graph = emptyGraph()): Promise<Graph> => {
  const [studyItem, kanji, word, grammarPoint, listeningClip, wordForm, wordReading, wordSense, levelCandidate] = await Promise.all([
    inChunks(ids, (c) => db.select().from(t.studyItem).where(inArray(t.studyItem.id, c))),
    inChunks(ids, (c) => db.select().from(t.kanji).where(inArray(t.kanji.studyItemId, c))),
    inChunks(ids, (c) => db.select().from(t.word).where(inArray(t.word.studyItemId, c))),
    inChunks(ids, (c) => db.select().from(t.grammarPoint).where(inArray(t.grammarPoint.studyItemId, c))),
    inChunks(ids, (c) => db.select().from(t.listeningClip).where(inArray(t.listeningClip.studyItemId, c))),
    inChunks(ids, (c) => db.select().from(t.wordForm).where(inArray(t.wordForm.wordId, c))),
    inChunks(ids, (c) => db.select().from(t.wordReading).where(inArray(t.wordReading.wordId, c))),
    inChunks(ids, (c) => db.select().from(t.wordSense).where(inArray(t.wordSense.wordId, c))),
    inChunks(ids, (c) => db.select().from(t.levelCandidate).where(inArray(t.levelCandidate.studyItemId, c))),
  ]);
  const [bySense, byGrammarPoint] = await Promise.all([
    inChunks(wordSense.map((s) => s.id), (c) => db.select().from(t.japaneseExplanation).where(inArray(t.japaneseExplanation.wordSenseId, c))),
    inChunks(ids, (c) => db.select().from(t.japaneseExplanation).where(inArray(t.japaneseExplanation.grammarPointId, c))),
  ]);
  const japaneseExplanation = [...new Map([...bySense, ...byGrammarPoint].map((e) => [e.id, e])).values()];
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

/** The rows a Reading Passage needs: it, its Sentence links, the Sentences, and the Words they use. */
const loadPassage = async (db: DbOrTx, id: string): Promise<Graph> => {
  const [readingPassage, passageContainsSentence] = await Promise.all([
    db.select().from(t.readingPassage).where(eq(t.readingPassage.id, id)),
    db.select().from(t.passageContainsSentence).where(eq(t.passageContainsSentence.passageId, id)),
  ]);
  const sentenceIds = passageContainsSentence.map((l) => l.sentenceId);
  const [sentence, sentenceUsesWord] = await Promise.all([
    db.select().from(t.sentence).where(inArray(t.sentence.id, sentenceIds)),
    db.select().from(t.sentenceUsesWord).where(inArray(t.sentenceUsesWord.sentenceId, sentenceIds)),
  ]);
  const studyItem = await db.select().from(t.studyItem).where(inArray(t.studyItem.id, unique(sentenceUsesWord.map((u) => u.wordId))));
  return withOverrides(db, { ...emptyGraph(), readingPassage, passageContainsSentence, sentence, sentenceUsesWord, studyItem });
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
    ...graph.readingPassage,
  ].map((r) => r.id));
  return { ...graph, override: await inChunks(recordIds, (c) => db.select().from(t.override).where(inArray(t.override.recordId, c))) };
};

const uuids = (ids: string[]) => sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

/**
 * A reader over `graph` plus the Provenance its records owe Attribution to: their own, and their inputs', transitively,
 * with the Import Runs that name their datasets.
 */
const readerOver = async (db: DbOrTx, graph: Graph) => {
  const links = recordProvenance(graph);
  const { rows } = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE closure(id) AS (
      SELECT unnest(${uuids([...new Set(links.values())])})
      UNION
      SELECT rp.provenance_id
      FROM closure c
      JOIN content_graph.provenance p ON p.id = c.id
      CROSS JOIN unnest(p.inputs) AS i(record_id)
      JOIN content_graph.record_provenance rp ON rp.record_id = i.record_id
    )
    SELECT id FROM closure`);
  const provenance = await db.select().from(t.provenance).where(inArray(t.provenance.id, rows.map((r) => r.id)));
  const inputs = unique(provenance.flatMap((p) => p.inputs));
  const importRunIds = unique(provenance.map((p) => (p.source.kind === "import" ? p.source.importRunId : null)));
  const [inputLinks, importRun] = await Promise.all([
    db.execute<{ record_id: string; provenance_id: string }>(
      sql`SELECT record_id, provenance_id FROM content_graph.record_provenance WHERE record_id = ANY(${uuids(inputs)})`,
    ),
    db.select().from(t.importRun).where(inArray(t.importRun.id, importRunIds)),
  ]);
  for (const r of inputLinks.rows) links.set(r.record_id, r.provenance_id);
  return reader({ ...graph, provenance, importRun }, links);
};
