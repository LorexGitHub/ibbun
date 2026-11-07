import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { emptyGraph, tables } from "../../graph.ts";
import { createFakeAuthoring, migrateContentGraph } from "../../testing.ts";
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
  priorityTags: [],
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
    await h.a.insert("provenance", [{ id: provenanceId, source: { kind: "authored", by: "t" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] }]);
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

    it("adds, changes and retires KANJIDIC2 characters", async () => {
      const kanji = { key: "食", meanings: ["eat"], onReadings: ["ショク"], kunReadings: ["た.べる"], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };
      await apply("kanjidic", [kanji]);
      const id = await idOf("kanjidic", "食");
      expect((await apply("kanjidic", [{ ...kanji, meanings: ["eat", "food"] }])).counts.changed).toBe(1);
      expect((await h.a.rows("kanji", { studyItemId: id }))[0]).toMatchObject({ literal: "食", meanings: ["eat", "food"] });
      expect((await apply("kanjidic", [])).counts.retired).toBe(1);
      expect((await h.a.rows("studyItem", { id }))[0]!.retired).toBe(true);
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
