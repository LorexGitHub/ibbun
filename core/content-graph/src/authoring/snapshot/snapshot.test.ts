import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { emptyGraph, tables } from "../../graph.ts";
import { createFakeAuthoring, migrateContentGraph } from "../../testing.ts";
import { currentLevel } from "../../levels/levels.ts";
import { createAuthoring, type Authoring, type Clock } from "../index.ts";
import type { Dataset, Records, SentenceRecord, SnapshotOptions, WordRecord } from "./types.ts";

const clock = (): Clock => {
  let t = Date.parse("2026-11-06T00:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

const LOOSE = { breaker: { maxChangedShare: 1, maxExamplesRedrafted: 1000, maxLevelChanges: 1000 } };

const word = (key: string, forms: string[], readings: string[], senses: [string[], string[]][]): WordRecord => ({
  key,
  forms,
  readings: readings.map((text) => ({ text, pitchAccent: null })),
  senses: senses.map(([partsOfSpeech, glosses]) => ({ partsOfSpeech, glosses })),
  priorityTags: [], usuallyKana: false,
});

const taberu = word("1", ["食べる"], ["たべる"], [[["v1"], ["to eat"]], [["v1"], ["to live on"]]]);
const nomu = word("2", ["飲む"], ["のむ"], [[["v5m"], ["to drink"]]]);

const sentence = (key: string, text: string, translationEn = "I eat bread.", author: string | null = "ann"): SentenceRecord => ({
  key,
  text,
  translationEn,
  tokens: [],
  author,
  licence: "cc-by-2.0-fr",
});

type Harness = { a: Authoring; reset: () => Promise<void> };

const contract = (make: () => Promise<Harness>) => {
  let h: Harness;
  let version = 0;
  beforeAll(async () => {
    h = await make();
  });
  beforeEach(async () => {
    await h.reset();
  });

  const apply = <D extends Dataset>(dataset: D, records: Records[D][], options: SnapshotOptions = LOOSE) =>
    h.a.applySnapshot(dataset, { upstreamVersion: String(++version), checksum: "c" }, records, options);
  const idOf = async (dataset: Dataset, key: string) => (await h.a.rows("sourceKey", { dataset, upstreamKey: key }))[0]!.recordId;
  const senses = async (wordId: string) => (await h.a.rows("wordSense", { wordId })).sort((x, y) => x.position - y.position);
  const reasons = async (importRunId: string) => (await h.a.queue({ importRunId })).map((e) => e.reason).sort();

  /** An Approved Sentence with an Approved Example of `item` on `span`, plus its Provenance. */
  const exampleOn = async (item: string, text = "パンを食べる。", span: [number, number] = [3, 6], targetSenseId: string | null = null) => {
    const provenanceId = randomUUID();
    await h.a.insert("provenance", [{ id: provenanceId, source: { kind: "authored", by: "t" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
    const sentenceId = randomUUID();
    const life = { approval: "approved" as const, retired: false, provenanceId };
    await h.a.insert("sentence", [{ id: sentenceId, text, translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life }]);
    const id = randomUUID();
    await h.a.insert("example", [{ id, sentenceId, studyItemId: item, spanStart: span[0], spanEnd: span[1], targetSenseId, hint: null, comprehensionQuestion: null, ...life }]);
    return { id, provenanceId, life };
  };

  const override = async (recordId: string, field: string, basedOn: unknown, provenanceId: string) => {
    const id = randomUUID();
    await h.a.insert("override", [{ id, recordId, field, value: ["fixed"], basedOn, state: "active", approval: "approved", retired: false, provenanceId }]);
    return id;
  };
  const stateOf = async (id: string) => (await h.a.rows("override", { id }))[0]!.state;

  describe("new keys and reruns", () => {
    it("adds JMdict entries Approved with their forms, readings and senses, and a rerun changes nothing", async () => {
      const report = await apply("jmdict", [taberu, nomu]);
      expect(report).toMatchObject({ status: "applied", counts: { added: 2, changed: 0, retired: 0 }, tripped: [] });
      const id = await idOf("jmdict", "1");
      expect((await h.a.rows("studyItem", { id }))[0]).toMatchObject({ type: "word", approval: "approved", retired: false });
      expect((await senses(id)).map((s) => s.glosses)).toEqual([["to eat"], ["to live on"]]);
      const [provenance] = await h.a.rows("provenance", { id: (await h.a.rows("wordForm", { wordId: id }))[0]!.provenanceId });
      expect((await h.a.rows("importRun", { id: report.importRunId }))[0]!.appliedAt).toBeInstanceOf(Date);
      expect(provenance).toMatchObject({ licence: "edrdg", source: { kind: "import", importRunId: report.importRunId } });

      const again = await h.a.applySnapshot("jmdict", { upstreamVersion: String(version), checksum: "c" }, [taberu]);
      expect(again).toMatchObject({ status: "unchanged", importRunId: report.importRunId, counts: { added: 2 } });
      expect(await h.a.rows("studyItem", { retired: true })).toEqual([]);

      expect((await apply("jmdict", [taberu, nomu])).counts).toMatchObject({ added: 0, changed: 0 });
    });

    describe("Sentence uses Word links", () => {
      const link = (over: Partial<NonNullable<SentenceRecord["links"]>[number]> = {}) => ({
        entry: null, form: "食べる", reading: null, sense: null, start: 3, end: 6, ...over,
      });
      const withLinks = (links: NonNullable<SentenceRecord["links"]>, text = "パンを食べる。") => ({ ...sentence("10", text), links });
      const linksOf = async () => h.a.rows("sentenceUsesWord", { sentenceId: await idOf("tatoeba", "10") });

      it("links by JMdict entry, picking the numbered sense and the form it was written in", async () => {
        await apply("jmdict", [taberu, nomu]);
        await apply("tatoeba", [withLinks([link({ entry: "1", sense: 2 })])]);
        const [row] = await linksOf();
        expect(row).toMatchObject({ wordId: await idOf("jmdict", "1"), spanStart: 3, spanEnd: 6, approval: "draft" });
        expect(row!.senseId).toBe((await senses(await idOf("jmdict", "1")))[1]!.id);
        expect(row!.formId).not.toBeNull();
      });

      it("falls back to the form when there is no entry, and leaves an unknown form unlinked", async () => {
        await apply("jmdict", [taberu]);
        await apply("tatoeba", [withLinks([link(), link({ form: "走る", start: 0, end: 1 })])]);
        expect(await linksOf()).toHaveLength(1);
      });

      it("replaces the links when they change and keeps them when they do not", async () => {
        await apply("jmdict", [taberu, nomu]);
        await apply("tatoeba", [withLinks([link()])]);
        const [first] = await linksOf();
        await apply("tatoeba", [withLinks([link()])]);
        expect((await linksOf())[0]!.id).toBe(first!.id);
        await apply("tatoeba", [withLinks([link({ form: "飲む", start: 0, end: 2 })])]);
        const rows = await linksOf();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.wordId).toBe(await idOf("jmdict", "2"));
      });
    });

    it("adds Tatoeba Sentences as Draft, credited to their author", async () => {
      await apply("tatoeba", [sentence("10", "パンを食べる。")]);
      const [row] = await h.a.rows("sentence", { id: await idOf("tatoeba", "10") });
      expect(row).toMatchObject({ approval: "draft", translationEn: "I eat bread." });
      expect((await h.a.rows("provenance", { id: row!.provenanceId }))[0]).toMatchObject({ author: "ann", licence: "cc-by-2.0-fr", sourceUrl: "https://tatoeba.org/sentences/show/10" });
    });

    describe("ja Wiktionary glosses", () => {
      const gloss = (key: string, title: string, text = "食物を口に入れて、かみ砕いて飲み込むこと。") => ({ key, title, text });
      const levelled = async (wordKey: string) => {
        const wordId = await idOf("jmdict", wordKey);
        const provenanceId = randomUUID();
        await h.a.insert("provenance", [{ id: provenanceId, source: { kind: "authored", by: "t" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
        await h.a.insert("levelCandidate", [{ id: randomUUID(), studyItemId: wordId, level: "N5", kind: "editorial", approval: "approved", retired: false, provenanceId }]);
        return wordId;
      };

      it("adds a gloss of a JLPT Word as a Draft on its first sense, with CC BY-SA 4.0 and a link to the page, and asks for alignment", async () => {
        await apply("jmdict", [taberu, nomu]);
        const wordId = await levelled("1");
        const report = await apply("wiktionary-ja", [gloss("食べる#0.0", "食べる"), gloss("飲む#0.0", "飲む"), gloss("犬#0.0", "犬")]);
        expect(report.counts).toMatchObject({ added: 1 });
        const [row] = await h.a.rows("japaneseExplanation", { id: await idOf("wiktionary-ja", "食べる#0.0") });
        expect(row).toMatchObject({ approval: "draft", retired: false, wordSenseId: (await senses(wordId))[0]!.id, grammarPointId: null });
        expect((await h.a.rows("provenance", { id: row!.provenanceId }))[0]).toMatchObject({
          licence: "cc-by-sa-4.0",
          sourceUrl: `https://ja.wiktionary.org/wiki/${encodeURIComponent("食べる")}`,
          source: { kind: "import", importRunId: report.importRunId },
        });
        expect(await h.a.rows("generationRequest", { targetId: wordId, kind: "sense_alignment" })).toHaveLength(1);
      });

      it("matches a kana page to a Word with no kanji form, and leaves a page that could be two Words alone", async () => {
        await apply("jmdict", [word("3", [], ["いちばん"], [[["adv"], ["best"]]]), word("4", ["雨"], ["あめ"], [[["n"], ["rain"]]]), word("5", ["飴"], ["あめ"], [[["n"], ["candy"]]]), word("6", [], ["あめ"], [[["n"], ["sweet"]]])]);
        for (const key of ["3", "4", "5", "6"]) await levelled(key);
        const report = await apply("wiktionary-ja", [gloss("いちばん#0.0", "いちばん"), gloss("あめ#0.0", "あめ")]);
        expect(report.counts).toMatchObject({ added: 2 });
      });

      it("waits for a Word that has no live sense, then takes the gloss on a later run", async () => {
        await apply("jmdict", [nomu]);
        const wordId = await levelled("2");
        await h.a.update("wordSense", { wordId }, { retired: true });
        expect((await apply("wiktionary-ja", [gloss("飲む#0.0", "飲む")])).counts).toMatchObject({ added: 0 });
        expect(await h.a.rows("generationRequest", { targetId: wordId })).toEqual([]);
        await h.a.update("wordSense", { wordId }, { retired: false });
        expect((await apply("wiktionary-ja", [gloss("飲む#0.0", "飲む")])).counts).toMatchObject({ added: 1 });
      });

      it("returns a changed gloss to Draft, retires one that left the page, and ignores one still unmatched on a rerun", async () => {
        await apply("jmdict", [taberu]);
        await levelled("1");
        await apply("wiktionary-ja", [gloss("食べる#0.0", "食べる"), gloss("犬#0.0", "犬")]);
        const id = await idOf("wiktionary-ja", "食べる#0.0");
        await h.a.update("japaneseExplanation", { id }, { approval: "approved" });
        expect((await apply("wiktionary-ja", [gloss("食べる#0.0", "食べる"), gloss("犬#0.0", "犬")])).counts).toMatchObject({ added: 0, changed: 0 });
        expect((await apply("wiktionary-ja", [gloss("食べる#0.0", "食べる", "新しい説明。")])).counts).toMatchObject({ changed: 1 });
        expect((await h.a.rows("japaneseExplanation", { id }))[0]).toMatchObject({ text: "新しい説明。", approval: "draft" });
        expect((await apply("wiktionary-ja", [])).counts).toMatchObject({ retired: 1 });
        expect((await h.a.rows("japaneseExplanation", { id }))[0]!.retired).toBe(true);
      });
    });

    describe("UniDic pitch accent", () => {
      const accent = (form: string, reading: string, pitchAccent: number[]) => ({ key: `${form}\t${reading}`, form, reading, pitchAccent });
      const readingOf = async (wordKey: string) => (await h.a.rows("wordReading", { wordId: await idOf("jmdict", wordKey) }))[0]!;

      it("gives a reading the accent of the UniDic lexeme with its form and reading, credited to NINJAL under the BSD licence", async () => {
        await apply("jmdict", [taberu, nomu]);
        const report = await apply("unidic", [accent("食べる", "たべる", [2]), accent("走る", "はしる", [1])]);
        expect(report.counts).toMatchObject({ added: 1 });
        const row = await readingOf("1");
        expect(row.pitchAccent).toEqual([2]);
        expect((await h.a.rows("provenance", { id: row.provenanceId }))[0]).toMatchObject({
          licence: "bsd-3-clause",
          author: "National Institute for Japanese Language and Linguistics",
          source: { kind: "import", importRunId: report.importRunId },
        });
        expect((await readingOf("2")).pitchAccent).toBeNull();
      });

      it("matches a katakana reading by its hiragana, and a Word with no form by its reading", async () => {
        await apply("jmdict", [word("3", [], ["コーヒー"], [[["n"], ["coffee"]]]), word("4", [], ["いちばん"], [[["adv"], ["best"]]])]);
        await apply("unidic", [accent("コーヒー", "こーひー", [3]), accent("いちばん", "いちばん", [3, 0])]);
        expect((await readingOf("3")).pitchAccent).toEqual([3]);
        expect((await readingOf("4")).pitchAccent).toEqual([3, 0]);
      });

      it("leaves a lexeme that could be two readings alone, then takes it once JMdict has one", async () => {
        await apply("jmdict", [word("5", ["雨"], ["あめ"], [[["n"], ["rain"]]]), word("6", ["雨"], ["あめ"], [[["n"], ["rain"]]])]);
        const report = await apply("unidic", [accent("雨", "あめ", [1])]);
        expect(report.counts).toMatchObject({ added: 0 });
        expect(report.notes).toEqual(["雨 (あめ) matches 2 JMdict readings: skipped"]);
        await apply("jmdict", [word("5", ["雨"], ["あめ"], [[["n"], ["rain"]]])]);
        expect((await apply("unidic", [accent("雨", "あめ", [1])])).counts).toMatchObject({ added: 1 });
      });

      it("keeps the accent and its credit when JMdict refreshes, and counts nothing as changed", async () => {
        await apply("jmdict", [taberu]);
        await apply("unidic", [accent("食べる", "たべる", [2])]);
        const before = await readingOf("1");
        const report = await apply("jmdict", [{ ...taberu, senses: [{ partsOfSpeech: ["v1"], glosses: ["to eat"] }, taberu.senses[1]!] }, ]);
        expect(report.counts).toMatchObject({ changed: 0 });
        expect(await readingOf("1")).toMatchObject({ pitchAccent: [2], provenanceId: before.provenanceId });
        await apply("jmdict", [{ ...taberu, priorityTags: ["ichi1"] }]);
        expect(await readingOf("1")).toMatchObject({ pitchAccent: [2], provenanceId: before.provenanceId });
      });

      it("changes a changed accent, ignores an unchanged one, and takes the accent away when the lexeme leaves UniDic", async () => {
        await apply("jmdict", [taberu]);
        await apply("unidic", [accent("食べる", "たべる", [2])]);
        expect((await apply("unidic", [accent("食べる", "たべる", [2])])).counts).toMatchObject({ changed: 0 });
        expect((await apply("unidic", [accent("食べる", "たべる", [0, 2])])).counts).toMatchObject({ changed: 1 });
        expect((await readingOf("1")).pitchAccent).toEqual([0, 2]);
        expect((await apply("unidic", [])).counts).toMatchObject({ retired: 1 });
        const row = await readingOf("1");
        expect(row.pitchAccent).toBeNull();
        expect((await h.a.rows("provenance", { id: row.provenanceId }))[0]).toMatchObject({ licence: "edrdg" });
      });
    });

    it("adds, changes and retires KANJIDIC2 characters", async () => {
      const kanji = { key: "食", meanings: ["eat"], onReadings: ["ショク"], kunReadings: ["た.べる"], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };
      await apply("kanjidic", [kanji]);
      const id = await idOf("kanjidic", "食");
      expect((await apply("kanjidic", [{ ...kanji, meanings: ["eat", "food"] }])).counts.changed).toBe(1);
      expect((await h.a.rows("kanji", { studyItemId: id }))[0]).toMatchObject({ literal: "食", meanings: ["eat", "food"] });
      expect((await apply("kanjidic", [])).counts.retired).toBe(1);
      expect((await h.a.rows("studyItem", { id }))[0]!.retired).toBe(true);
    });
    it("leaves KanjiVG strokes alone when KANJIDIC2 refreshes, and does not count the Kanji as changed", async () => {
      const kanji = { key: "食", meanings: ["eat"], onReadings: [], kunReadings: [], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };
      await apply("kanjidic", [kanji]);
      await apply("kanjivg", [{ key: "098df", strokes: ["M1,2"] }]);
      expect((await apply("kanjidic", [kanji])).counts).toMatchObject({ changed: 0 });
      expect((await apply("kanjidic", [{ ...kanji, meanings: ["eat", "food"] }])).counts).toMatchObject({ changed: 1 });
      expect((await h.a.rows("kanji", { studyItemId: await idOf("kanjidic", "食") }))[0]).toMatchObject({ meanings: ["eat", "food"], strokes: ["M1,2"] });
    });

    it("sets KanjiVG strokes on the KANJIDIC2 Kanji of the same code point, and skips code points KANJIDIC2 lacks", async () => {
      const kanji = { key: "食", meanings: ["eat"], onReadings: [], kunReadings: [], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };
      await apply("kanjidic", [kanji]);
      const id = await idOf("kanjidic", "食");
      const stray = { key: "04e80", strokes: ["M1,1"] };
      const report = await apply("kanjivg", [{ key: "098df", strokes: ["M1,2", "M3,4"] }, stray]);
      expect(report.counts).toMatchObject({ added: 1, changed: 0 });
      expect((await h.a.rows("kanji", { studyItemId: id }))[0]!.strokes).toEqual(["M1,2", "M3,4"]);
      expect(await idOf("kanjivg", "098df")).toBe(id);

      expect((await apply("kanjivg", [{ key: "098df", strokes: ["M1,2", "M5,6"] }])).counts).toMatchObject({ added: 0, changed: 1, retired: 0 });
      expect((await h.a.rows("kanji", { studyItemId: id }))[0]!.strokes).toEqual(["M1,2", "M5,6"]);

      expect((await apply("kanjivg", [])).counts.retired).toBe(1);
      expect((await h.a.rows("kanji", { studyItemId: id }))[0]!.strokes).toEqual([]);
      expect((await h.a.rows("studyItem", { id }))[0]!.retired).toBe(false);
    });

    describe("Tanos Kanji levels", () => {
      const shoku = { key: "食", meanings: ["eat"], onReadings: ["ショク"], kunReadings: ["た.べる"], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };
      const candidates = async (literal: string) => h.a.rows("levelCandidate", { studyItemId: await idOf("kanjidic", literal) });
      const levelOf = async (literal: string) => currentLevel(await candidates(literal));

      it("adds an Approved List candidate to each listed Kanji, credited to Waller under CC BY", async () => {
        await apply("kanjidic", [shoku]);
        const report = await apply("tanos", [{ key: "食", level: "N4" }]);
        const [candidate] = await candidates("食");
        expect(candidate).toMatchObject({ level: "N4", kind: "list", approval: "approved", retired: false });
        expect(await levelOf("食")).toBe("N4");
        expect(report.counts).toMatchObject({ added: 1, levelsChanged: 1 });
        const [provenance] = await h.a.rows("provenance", { id: candidate!.provenanceId });
        expect(provenance).toMatchObject({
          licence: "cc-by",
          author: "Jonathan Waller",
          sourceUrl: "https://web.archive.org/web/20200117222855/http://www.tanos.co.uk/jlpt/",
          source: { kind: "import", importRunId: report.importRunId },
        });
      });

      it("skips a Kanji KANJIDIC2 does not have and says so in the report", async () => {
        await apply("kanjidic", [shoku]);
        const report = await apply("tanos", [{ key: "食", level: "N4" }, { key: "仮", level: "N1" }]);
        expect(report.notes).toEqual(["仮 is not in KANJIDIC2: skipped"]);
        expect(report.counts.added).toBe(1);
        expect(await h.a.rows("sourceKey", { dataset: "tanos", upstreamKey: "仮" })).toEqual([]);
      });

      it("fails, writing nothing, when KANJIDIC2 has not been imported yet", async () => {
        await expect(apply("tanos", [{ key: "食", level: "N4" }])).rejects.toThrow(/import KANJIDIC2 first/);
        expect(await h.a.rows("importRun", { dataset: "tanos" })).toEqual([]);
        expect(await h.a.rows("levelCandidate", {})).toEqual([]);
      });

      it("rewrites only its own candidate when the list changes, and never an Editorial one", async () => {
        await apply("kanjidic", [shoku]);
        await apply("tanos", [{ key: "食", level: "N4" }]);
        const [list] = await candidates("食");
        const editorial = randomUUID();
        await h.a.insert("levelCandidate", [{ id: editorial, studyItemId: list!.studyItemId, level: "N2", kind: "editorial", approval: "approved", retired: false, provenanceId: list!.provenanceId }]);

        expect((await apply("tanos", [{ key: "食", level: "N3" }])).counts.changed).toBe(1);
        expect((await h.a.rows("levelCandidate", { id: list!.id }))[0]).toMatchObject({ level: "N3", retired: false });
        expect((await h.a.rows("levelCandidate", { id: editorial }))[0]).toMatchObject({ level: "N2" });
        expect(await levelOf("食")).toBe("N2");
        expect((await apply("tanos", [{ key: "食", level: "N3" }])).counts).toMatchObject({ changed: 0, levelsChanged: 0 });
      });

      it("Retires the List candidate when the list drops the Kanji, leaving the Kanji itself alone", async () => {
        await apply("kanjidic", [shoku]);
        await apply("tanos", [{ key: "食", level: "N4" }]);
        expect((await apply("tanos", [])).counts).toMatchObject({ retired: 1, levelsChanged: 1 });
        expect(await levelOf("食")).toBeNull();
        expect((await h.a.rows("studyItem", { id: await idOf("kanjidic", "食") }))[0]!.retired).toBe(false);
      });

      it("revives a Retired candidate that the list brings back", async () => {
        await apply("kanjidic", [shoku]);
        await apply("tanos", [{ key: "食", level: "N4" }]);
        await apply("tanos", []);
        expect((await apply("tanos", [{ key: "食", level: "N4" }])).counts).toMatchObject({ changed: 1, levelsChanged: 1 });
        expect(await levelOf("食")).toBe("N4");
      });
    });
  });

  describe("changed keys", () => {
    it("matches forms and readings by text and senses by fingerprint, then similarity", async () => {
      await apply("jmdict", [taberu]);
      const id = await idOf("jmdict", "1");
      const [eat, liveOn] = await senses(id);
      const [form] = await h.a.rows("wordForm", { wordId: id });
      const changed = word("1", ["喰べる", "食べる"], ["たべる"], [[["v1"], ["to live on"]], [["v1", "vt"], ["to eat", "to consume"]]]);
      expect((await apply("jmdict", [changed])).counts).toMatchObject({ changed: 1, unmatchedSenses: 0 });
      expect((await senses(id)).map((s) => s.id)).toEqual([liveOn!.id, eat!.id]);
      const forms = await h.a.rows("wordForm", { wordId: id });
      expect(forms.find((f) => f.text === "食べる")).toMatchObject({ id: form!.id, position: 1 });
      expect(forms).toHaveLength(2);
    });

    it("sends what hangs off an unmatched sense back to Draft, queued, and never re-points it", async () => {
      await apply("jmdict", [taberu]);
      const id = await idOf("jmdict", "1");
      const [, liveOn] = await senses(id);
      const { id: exampleId, provenanceId } = await exampleOn(id, "パンを食べる。", [3, 6], liveOn!.id);
      await exampleOn(id);
      const explanation = randomUUID();
      await h.a.insert("japaneseExplanation", [{ id: explanation, wordSenseId: liveOn!.id, grammarPointId: null, text: "生活する", approval: "approved", retired: false, provenanceId }]);
      const fix = await override(liveOn!.id, "glosses", ["to live on"], provenanceId);

      const report = await apply("jmdict", [word("1", ["食べる"], ["たべる"], [[["v1"], ["to eat"]], [["n"], ["meal"]]])]);
      expect(report.counts).toMatchObject({ unmatchedSenses: 1, approvedExamplesRedrafted: 1, orphanedOverrides: 1, suspended: 0 });
      expect((await h.a.rows("example", { id: exampleId }))[0]).toMatchObject({ approval: "draft", targetSenseId: liveOn!.id });
      expect((await h.a.rows("japaneseExplanation", { id: explanation }))[0]!.approval).toBe("draft");
      expect((await h.a.rows("wordSense", { id: liveOn!.id }))[0]!.retired).toBe(true);
      expect(await stateOf(fix)).toBe("orphaned");
      expect(await reasons(report.importRunId)).toEqual(["orphaned override", "unmatched sense", "unmatched sense"]);
    });

    it("re-applies, marks Stale or Orphans overrides, and never deletes them", async () => {
      await apply("jmdict", [taberu]);
      const id = await idOf("jmdict", "1");
      const [eat, liveOn] = await senses(id);
      const [reading] = await h.a.rows("wordReading", { wordId: id });
      const { provenanceId } = await exampleOn(id);
      const kept = await override(eat!.id, "partsOfSpeech", ["v1"], provenanceId);
      const stale = await override(liveOn!.id, "glosses", ["to live on"], provenanceId);
      const orphan = await override(reading!.id, "pitchAccent", null, provenanceId);

      const report = await apply("jmdict", [word("1", ["食べる"], ["くう"], [[["v1"], ["to eat"]], [["v1"], ["to live on", "to subsist on"]]])]);
      expect(report.counts).toMatchObject({ staleOverrides: 1, orphanedOverrides: 1, unmatchedSenses: 0 });
      expect([await stateOf(kept), await stateOf(stale), await stateOf(orphan)]).toEqual(["active", "stale", "orphaned"]);
      expect(await reasons(report.importRunId)).toEqual(["orphaned override", "stale override"]);
      expect(await h.a.rows("override")).toHaveLength(3);
    });
  });

  describe("gone keys", () => {
    it("retires a merged entry and hands its Examples, level and overrides to the one successor", async () => {
      const merged = word("3", ["喰べる"], ["たべる"], [[["v1"], ["to eat"]]]);
      await apply("jmdict", [taberu, merged]);
      const gone = await idOf("jmdict", "3");
      const successor = await idOf("jmdict", "1");
      const { id: exampleId, provenanceId, life } = await exampleOn(gone);
      await h.a.insert("levelCandidate", [{ id: randomUUID(), studyItemId: gone, level: "N4", kind: "list", ...life }]);
      const fix = await override(gone, "priorityTags", [], provenanceId);

      const report = await apply("jmdict", [word("1", ["食べる", "喰べる"], ["たべる"], [[["v1"], ["to eat"]]])], {
        breaker: { ...LOOSE.breaker, maxLevelChanges: 1 },
      });
      expect(report.counts).toMatchObject({ retired: 1, superseded: 1, levelsChanged: 1, retiredLevelledWithoutSuccessor: 0 });
      expect((await h.a.rows("studyItem", { id: gone }))[0]!.retired).toBe(true);
      expect((await h.a.rows("wordSupersededBy", { retiredWordId: gone }))[0]).toMatchObject({ wordId: successor, approval: "approved" });
      const [copy] = await h.a.rows("example", { studyItemId: successor });
      expect(copy).toMatchObject({ approval: "draft", sentenceId: (await h.a.rows("example", { id: exampleId }))[0]!.sentenceId });
      expect((await h.a.rows("levelCandidate", { studyItemId: successor }))[0]).toMatchObject({ level: "N4", kind: "editorial", approval: "draft" });
      expect(await stateOf(fix)).toBe("orphaned");
      const orphaned = await h.a.queue({ importRunId: report.importRunId, reason: "orphaned override" });
      expect(orphaned[0]!.detail).toMatchObject({ suggestedTarget: successor });
      expect(await reasons(report.importRunId)).toEqual(["orphaned override", "superseded"]);
      expect(report.counts.suspended).toBe(0);
    });

    it("records no successor when a pair of the gone entry lives on in two entries", async () => {
      const merged = word("3", ["喰べる"], ["たべる"], [[["v1"], ["to eat"]]]);
      await apply("jmdict", [taberu, merged]);
      const twice = [word("1", ["喰べる"], ["たべる"], []), word("4", ["喰べる"], ["たべる"], [])];
      expect((await apply("jmdict", twice)).counts).toMatchObject({ retired: 1, superseded: 0, added: 1 });
      expect(await h.a.rows("wordSupersededBy")).toEqual([]);
    });
  });

  describe("Tatoeba refreshes", () => {
    const withExample = async (text: string, span: [number, number]) => {
      await apply("jmdict", [taberu]);
      await apply("tatoeba", [sentence("10", text)]);
      const sentenceId = await idOf("tatoeba", "10");
      const item = await idOf("jmdict", "1");
      const { id, life } = await exampleOn(item);
      await h.a.update("example", { id }, { sentenceId, spanStart: span[0], spanEnd: span[1] });
      await h.a.update("sentence", { id: sentenceId }, { approval: "approved" });
      return { id, item, life };
    };

    it("moves an Example's span when its target still appears exactly once", async () => {
      const { id } = await withExample("パンを食べる。", [3, 6]);
      expect((await apply("tatoeba", [sentence("10", "朝、パンを食べる。")])).counts).toMatchObject({ changed: 1, examplesRedrafted: 0 });
      expect((await h.a.rows("example", { id }))[0]).toMatchObject({ spanStart: 5, spanEnd: 8, approval: "approved" });
    });

    it("redrafts an Example whose target is gone or ambiguous, and counts the Study Item it Suspends", async () => {
      const { id, item } = await withExample("パンを食べる。", [3, 6]);
      const report = await apply("tatoeba", [sentence("10", "食べる、食べる。")]);
      expect(report.counts).toMatchObject({ examplesRedrafted: 1, approvedExamplesRedrafted: 1, suspended: 1 });
      expect((await h.a.rows("example", { id }))[0]!.approval).toBe("draft");
      expect(await h.a.isSuspended(item)).toBe(true);
      expect(await reasons(report.importRunId)).toEqual(["example redrafted", "suspended"]);
    });

    it("redrafts every Example when the translation changes, and only updates credit when the author does", async () => {
      const { id } = await withExample("パンを食べる。", [3, 6]);
      expect((await apply("tatoeba", [sentence("10", "パンを食べる。", "I eat bread.", "bob")])).counts.examplesRedrafted).toBe(0);
      const [row] = await h.a.rows("sentence", { id: await idOf("tatoeba", "10") });
      expect((await h.a.rows("provenance", { id: row!.provenanceId }))[0]!.author).toBe("bob");
      expect((await apply("tatoeba", [sentence("10", "パンを食べる。", "I'm eating bread.", "bob")])).counts.examplesRedrafted).toBe(1);
      expect((await h.a.rows("example", { id }))[0]!.approval).toBe("draft");
    });

    it("retires a deleted Sentence and its Examples", async () => {
      const { id, item } = await withExample("パンを食べる。", [3, 6]);
      expect((await apply("tatoeba", [])).counts).toMatchObject({ retired: 1, suspended: 1 });
      expect((await h.a.rows("example", { id }))[0]!.retired).toBe(true);
      expect(await h.a.isSuspended(item)).toBe(true);
    });
  });

  describe("Word Level Candidates from yomitan-jlpt-vocab", () => {
    const listed = (key: string, level: Records["yomitan"]["level"]) => ({ key, level });
    const candidates = async (key: string) => h.a.rows("levelCandidate", { studyItemId: await idOf("jmdict", key) });

    it("lists a List candidate on each JMdict Word by ent_seq, credited to Waller and stephenmk, and a rerun changes nothing", async () => {
      await apply("jmdict", [taberu, nomu]);
      const report = await apply("yomitan", [listed("1", "N5")]);
      expect(report).toMatchObject({ status: "applied", counts: { added: 1, levelsChanged: 1 }, notes: [] });
      const [candidate] = await candidates("1");
      expect(candidate).toMatchObject({ level: "N5", kind: "list", approval: "approved", retired: false });
      expect((await h.a.rows("provenance", { id: candidate!.provenanceId }))[0]).toMatchObject({
        licence: "cc-by-sa-4.0",
        source: { kind: "import", importRunId: report.importRunId },
        author: "Jonathan Waller, via stephenmk",
        sourceUrl: "https://github.com/stephenmk/yomitan-jlpt-vocab",
      });
      expect(await candidates("2")).toEqual([]);
      expect((await apply("yomitan", [listed("1", "N5")])).counts).toMatchObject({ added: 0, changed: 0, levelsChanged: 0 });
      expect(await candidates("1")).toHaveLength(1);
    });

    it("skips an ent_seq with no JMdict Word, names it in the report, and lists it once the Word arrives", async () => {
      await apply("jmdict", [taberu]);
      const report = await apply("yomitan", [listed("1", "N5"), listed("99", "N3")]);
      expect(report).toMatchObject({ counts: { added: 1 }, notes: ["ent_seq 99 is not in JMdict: skipped"] });
      await apply("jmdict", [taberu, word("99", ["猫"], ["ねこ"], [[["n"], ["cat"]]])]);
      const again = await apply("yomitan", [listed("1", "N5"), listed("99", "N3")]);
      expect(again).toMatchObject({ counts: { added: 1 }, notes: [] });
      expect((await candidates("99"))[0]).toMatchObject({ level: "N3", kind: "list" });
    });

    it("changes the level in place, and retires the candidate when the list drops the Word", async () => {
      await apply("jmdict", [taberu]);
      await apply("yomitan", [listed("1", "N4")]);
      const [before] = await candidates("1");
      expect((await apply("yomitan", [listed("1", "N5")])).counts).toMatchObject({ changed: 1, levelsChanged: 1 });
      expect((await candidates("1"))[0]).toMatchObject({ id: before!.id, level: "N5", retired: false });
      expect((await apply("yomitan", [])).counts).toMatchObject({ retired: 1, levelsChanged: 1, retiredLevelledWithoutSuccessor: 0 });
      expect((await candidates("1"))[0]).toMatchObject({ retired: true });
      expect((await h.a.rows("studyItem", { id: await idOf("jmdict", "1") }))[0]!.retired).toBe(false);
    });

    it("never changes the current level while an Editorial candidate wins", async () => {
      await apply("jmdict", [taberu]);
      const id = await idOf("jmdict", "1");
      const { life } = await exampleOn(id);
      await h.a.insert("levelCandidate", [{ id: randomUUID(), studyItemId: id, level: "N2", kind: "editorial", ...life }]);
      expect((await apply("yomitan", [listed("1", "N5")])).counts).toMatchObject({ added: 1, levelsChanged: 0 });
      expect((await candidates("1")).find((c) => c.kind === "editorial")).toMatchObject({ level: "N2", retired: false });
    });

    it("trips the breaker when a run would change the current level of too many Words", async () => {
      await apply("jmdict", [taberu, nomu]);
      const strict = { maxChangedShare: 1, maxExamplesRedrafted: 0, maxLevelChanges: 1 };
      const report = await apply("yomitan", [listed("1", "N5"), listed("2", "N5")], { breaker: strict });
      expect(report).toMatchObject({ status: "breaker tripped", tripped: ["level changes"] });
      expect(await candidates("1")).toEqual([]);
    });
  });

  describe("the circuit breaker", () => {
    it("applies nothing when a run would change too much, and queues it", async () => {
      await apply("jmdict", [taberu, nomu]);
      const report = await apply("jmdict", [taberu], {});
      expect(report).toMatchObject({ status: "breaker tripped", tripped: ["changed share"], counts: { retired: 1 } });
      expect(await h.a.rows("studyItem", { retired: true })).toEqual([]);
      expect((await h.a.rows("importRun", { id: report.importRunId }))[0]).toMatchObject({ status: "breaker tripped", appliedAt: null });
      expect(await reasons(report.importRunId)).toEqual(["breaker tripped"]);
      expect((await apply("jmdict", [taberu], { release: true })).status).toBe("applied");
    });

    it("trips on a levelled item retired without successor, too many redrafts, or too many level changes", async () => {
      await apply("jmdict", [taberu, nomu]);
      const item = await idOf("jmdict", "2");
      const { life } = await exampleOn(item);
      await h.a.insert("levelCandidate", [{ id: randomUUID(), studyItemId: item, level: "N5", kind: "list", ...life }]);
      const strict = { maxChangedShare: 1, maxExamplesRedrafted: 0, maxLevelChanges: 0 };
      expect((await apply("jmdict", [taberu], { breaker: strict })).tripped).toEqual(["levelled item retired without successor", "level changes"]);

      await apply("tatoeba", [sentence("10", "飲む。")], LOOSE);
      const sentenceId = await idOf("tatoeba", "10");
      const { id } = await exampleOn(item);
      await h.a.update("example", { id }, { sentenceId, spanStart: 0, spanEnd: 2 });
      expect((await apply("tatoeba", [sentence("10", "飲む。", "Drink.")], { breaker: strict })).tripped).toEqual(["examples redrafted"]);
      expect((await h.a.rows("example", { id }))[0]!.approval).toBe("approved");
    });
  });
};

describe("applySnapshot, fake", () => {
  contract(async () => {
    let graph = emptyGraph();
    let a = createFakeAuthoring(graph, clock());
    const harness: Harness = {
      get a() {
        return a;
      },
      reset: async () => {
        graph = emptyGraph();
        a = createFakeAuthoring(graph, clock());
      },
    };
    return harness;
  });
});

describe("applySnapshot, against Postgres", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });

  contract(async () => ({
    a: createAuthoring(db, clock()),
    reset: async () => {
      const names = Object.values(tables).map((t) => `content_graph.${getTableName(t as PgTable)}`);
      await db.execute(`TRUNCATE ${names.join(", ")}`);
    },
  }));
});
