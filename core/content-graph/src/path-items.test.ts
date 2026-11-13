import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { createContentGraph, type ContentGraph, type PathItem } from "./index.ts";
import { createFakeContentGraph, emptyGraph, migrateContentGraph, seedContentGraph, type Graph } from "./testing.ts";
import type { Approval } from "./schema.ts";

const pathFixture = () => {
  let n = 0;
  const next = () => `00000000-0000-7000-8000-${(++n).toString().padStart(12, "0")}`;
  const graph: Graph = emptyGraph();
  const provenanceId = next();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
  const life = (approval: Approval = "approved", retired = false) => ({ approval, retired, provenanceId });
  const item = (type: Graph["studyItem"][number]["type"], level: "N5" | "N4" | null, retired = false) => {
    const id = next();
    graph.studyItem.push({ id, type, ...life("approved", retired) });
    if (type === "grammar_point") graph.grammarPoint.push({ studyItemId: id, title: id, forms: [], formation: [], register: "neutral", meaning: "m", notes: null, matcherRule: null });
    if (type === "listening_clip") graph.listeningClip.push({ studyItemId: id, kind: "sentence" });
    if (level) graph.levelCandidate.push({ id: next(), studyItemId: id, level, kind: "list", ...life() });
    return id;
  };
  const sentence = (approval?: Approval) => {
    const id = next();
    graph.sentence.push({ id, text: "s", translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life(approval) });
    return id;
  };
  const example = (studyItemId: string, sentenceId: string, approval?: Approval) =>
    graph.example.push({ id: next(), sentenceId, studyItemId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life(approval) });
  const kanji = (literal: string, level: "N5" | "N4", frequency: number | null, grade: number | null) => {
    const id = item("kanji", level);
    graph.kanji.push({ studyItemId: id, literal, meanings: [], onReadings: [], kunReadings: [], grade, frequency, strokeCount: 1, components: [], strokes: [], knownWrongMeanings: [] });
    return id;
  };
  const demonstrates = (sentenceId: string, grammarPointId: string, approval?: Approval) =>
    graph.sentenceDemonstratesGrammar.push({ id: next(), sentenceId, grammarPointId, spanStart: 0, spanEnd: 1, ...life(approval) });

  const shoku = kanji("食", "N5", 328, 2);
  const kuu = kanji("喰", "N4", null, null);
  example(shoku, sentence());
  example(kuu, sentence("draft"));

  const taberu = item("word", "N5");
  graph.word.push({ studyItemId: taberu, priorityTags: ["ichi1"] });
  graph.wordForm.push(
    { id: next(), wordId: taberu, position: 1, text: "喰べる", ...life() },
    { id: next(), wordId: taberu, position: 0, text: "食べる", ...life() },
  );
  graph.wordContainsKanji.push(
    { id: next(), wordId: taberu, kanjiId: shoku, position: 0, ...life() },
    { id: next(), wordId: taberu, kanjiId: kuu, position: 0, ...life() },
  );
  graph.override.push({ id: next(), recordId: taberu, field: "priorityTags", value: ["nf02"], basedOn: null, state: "active", ...life() });

  const kana = item("word", "N5");
  graph.word.push({ studyItemId: kana, priorityTags: [] });
  graph.wordContainsKanji.push({ id: next(), wordId: kana, kanjiId: shoku, position: 0, ...life() });

  const te = item("grammar_point", "N5");
  const masu = item("grammar_point", "N5");
  const gone = item("grammar_point", "N5", true);
  const teSentence = sentence();
  example(te, teSentence);
  demonstrates(teSentence, te);
  demonstrates(teSentence, masu);
  demonstrates(teSentence, gone);
  demonstrates(teSentence, masu, "draft");

  const clip = item("listening_clip", null);
  const clipSentence = sentence();
  graph.clipVoicesSentence.push({ id: next(), clipId: clip, sentenceId: clipSentence, position: 0, speaker: "男", voice: "v", audioKey: null, ...life() });
  graph.sentenceUsesWord.push({ id: next(), sentenceId: clipSentence, wordId: taberu, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life() });
  demonstrates(clipSentence, masu);

  const heard = item("word", null);
  graph.word.push({ studyItemId: heard, priorityTags: [] });
  graph.sentenceUsesWord.push({ id: next(), sentenceId: clipSentence, wordId: heard, formId: null, readingId: null, senseId: null, spanStart: 1, spanEnd: 2, ...life() });
  const dictionaryOnly = item("word", null);
  graph.word.push({ studyItemId: dictionaryOnly, priorityTags: ["news1"] });
  graph.wordForm.push({ id: next(), wordId: dictionaryOnly, position: 0, text: "食", ...life() });

  const facts = { priorityTags: [], frequency: null, grade: null, dependsOn: [], demonstrates: [] };
  const expected: PathItem[] = [
    { ...facts, id: shoku, type: "kanji", level: "N5", suspended: false, frequency: 328, grade: 2 },
    { ...facts, id: kuu, type: "kanji", level: "N4", suspended: true },
    { ...facts, id: taberu, type: "word", level: "N5", suspended: true, priorityTags: ["nf02"], dependsOn: [shoku] },
    { ...facts, id: kana, type: "word", level: "N5", suspended: true },
    { ...facts, id: te, type: "grammar_point", level: "N5", suspended: false, demonstrates: [masu] },
    { ...facts, id: masu, type: "grammar_point", level: "N5", suspended: true },
    { ...facts, id: clip, type: "listening_clip", level: null, suspended: false, dependsOn: [taberu, masu, heard].sort() },
    { ...facts, id: heard, type: "word", level: null, suspended: true },
  ] as unknown as PathItem[];
  return { graph, expected };
};

const { graph, expected } = pathFixture();
const DICTIONARY = 200_000;

const contract = (make: () => Promise<ContentGraph>) => {
  it("returns the visible Study Items the path can offer or depend on, leaving out a Word with no level that no clip uses", async () => {
    expect(await (await make()).pathItems()).toEqual(expected);
  });
};

describe("pathItems, fake", () => {
  contract(async () => createFakeContentGraph(graph));
});

describe("pathItems, against Postgres", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
    await seedContentGraph(db, graph);
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });
  contract(async () => createContentGraph(db));

  it("stays the same beside a whole dictionary of Words with no level", async () => {
    await db.execute(sql`
      WITH entry AS (
        INSERT INTO content_graph.study_item (id, type, approval, retired, provenance_id)
        SELECT gen_random_uuid(), 'word', 'approved', false, ${graph.provenance[0]!.id} FROM generate_series(1, ${DICTIONARY})
        RETURNING id
      ), word AS (
        INSERT INTO content_graph.word (study_item_id, priority_tags) SELECT id, '{}' FROM entry
      )
      INSERT INTO content_graph.word_form (id, word_id, position, text, approval, retired, provenance_id)
      SELECT gen_random_uuid(), id, 0, '語', 'approved', false, ${graph.provenance[0]!.id} FROM entry`);
    expect(await createContentGraph(db).pathItems()).toEqual(expected);
  }, 60_000);
});
