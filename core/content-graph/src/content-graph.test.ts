import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudyItemId } from "@ibbun/shared";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { createContentGraph, type ContentGraph } from "./index.ts";
import { createFakeContentGraph, migrateContentGraph, seedContentGraph, type Graph } from "./testing.ts";
import { fixture } from "./tests/fixture.ts";

const g = fixture();
const id = (key: keyof typeof g.ids) => g.ids[key] as StudyItemId;

const contract = (make: () => Promise<ContentGraph>) => {
  let cg: ContentGraph;
  beforeAll(async () => {
    cg = await make();
  });

  describe("successorOf", () => {
    it("names the visible Word that supersedes a Retired Word", async () => {
      expect(await cg.successorOf(id("retiredWord"))).toBe(id("taberu"));
    });

    it.each(["taberu", "draftWord", "missing"] as const)("names no successor for %s", async (key) => {
      expect(await cg.successorOf(id(key))).toBeNull();
    });
  });

  describe("readingPassage", () => {
    it("returns the approved Sentences in order, each with the Words it uses", async () => {
      const passage = await cg.readingPassage(g.ids.passage);
      expect(passage).toMatchObject({ id: g.ids.passage, title: "朝ごはん", form: "prose" });
      expect(passage?.sentences.map((s) => s.id)).toEqual([g.ids.sentence]);
      expect(passage?.sentences[0]?.words).toEqual([{ wordId: id("taberu"), start: 3, end: 6 }]);
      expect(passage?.attribution).toBeDefined();
    });

    it.each(["draftPassage", "missing"] as const)("returns nothing for %s", async (key) => {
      expect(await cg.readingPassage(g.ids[key])).toBeNull();
    });
  });

  describe("studyItem", () => {
    it("returns a Word with its visible forms, readings and senses in order, overrides applied", async () => {
      const page = await cg.studyItem(id("taberu"));
      expect(page?.item).toEqual({
        type: "word",
        id: id("taberu"),
        level: "N5",
        priorityTags: ["ichi1"],
        usuallyKana: false,
        forms: [
          { id: g.ids.taberuForm, text: "食べる" },
          { id: g.ids.taberuSecondForm, text: "喰べる" },
        ],
        readings: [{ id: g.ids.taberuReading, text: "たべる", pitchAccent: null }],
        senses: [
          {
            id: g.ids.taberuSense,
            partsOfSpeech: ["v1"],
            glosses: ["to eat", "to consume"],
            japaneseExplanation: "食べ物を口に入れて、かんで飲みこむこと。",
          },
        ],
      });
    });

    it("returns the Examples with their Sentence and approved answer data, nothing unapproved", async () => {
      const page = await cg.studyItem(id("taberu"));
      expect(page?.examples).toEqual([
        {
          id: g.ids.taberuExample,
          sentence: {
            id: g.ids.sentence,
            text: "パンを食べる。",
            translationEn: "I eat bread.",
            tokens: g.tokens,
            audio: { key: "audio/s1.ogg", voice: "四国めたん" },
            attribution: [],
          },
          target: { start: 3, end: 6 },
          targetSenseId: null,
          hint: "eat",
          comprehensionQuestion: null,
          accepted: [{ id: g.ids.accepted, written: "食べる", reading: "たべる" }],
          alternates: [{ id: g.ids.alternate, written: "食う", message: "That works, but we want the neutral verb." }],
          knownWrong: [{ id: g.ids.knownWrong, written: "飲む", message: "飲む is to drink." }],
          attribution: [],
        },
      ]);
    });

    it("links a Word to the Kanji it contains", async () => {
      const page = await cg.studyItem(id("taberu"));
      expect(page?.links).toEqual([
        {
          kind: "contains_kanji",
          position: 0,
          kanji: { id: id("shoku"), type: "kanji", level: "N4", label: "食", reading: "ショク", meaning: "eat" },
        },
      ]);
    });

    it("returns a Kanji with the visible Words that contain it", async () => {
      const page = await cg.studyItem(id("shoku"));
      expect(page?.item).toMatchObject({
        type: "kanji",
        literal: "食",
        meanings: ["eat", "food"],
        knownWrongMeanings: [{ answer: "drink", explanation: "That is 飲." }],
        level: "N4",
      });
      expect(page?.links).toEqual([
        {
          kind: "contained_in_word",
          position: 0,
          word: { id: id("taberu"), type: "word", level: "N5", label: "食べる", reading: "たべる", meaning: "to eat" },
        },
      ]);
    });

    it("returns a Grammar Point with its Japanese Explanation and related points", async () => {
      const page = await cg.studyItem(id("teshimau"));
      expect(page?.item).toMatchObject({
        type: "grammar_point",
        title: "〜てしまう",
        meaning: "to do completely; to do by mistake",
        japaneseExplanation: "動作が完了したことや、残念な気持ちを表す。",
        level: "N3",
      });
      expect(page?.links).toEqual([
        {
          kind: "relates_to",
          relation: "contrast",
          comparison: "ちゃう is the casual contraction.",
          grammarPoint: { id: id("chau"), type: "grammar_point", level: null, label: "〜ちゃう", reading: null, meaning: "casual てしまう" },
        },
      ]);
    });

    it("returns a Listening Clip with the Sentences it voices, in order", async () => {
      const page = await cg.studyItem(id("clip"));
      expect(page?.item).toEqual({ type: "listening_clip", id: id("clip"), level: null, kind: "sentence" });
      expect(page?.links).toEqual([
        {
          kind: "voices",
          position: 0,
          speaker: "女",
          voice: "四国めたん",
          audioKey: "audio/clip.ogg",
          sentence: expect.objectContaining({ id: g.ids.sentence, text: "パンを食べる。" }),
        },
      ]);
    });

    it.each(["draftWord", "rejectedWord", "retiredWord", "missing"] as const)("returns nothing for %s", async (key) => {
      expect(await cg.studyItem(id(key))).toBeNull();
    });

    it("leaves out Examples whose Sentence is not approved", async () => {
      expect((await cg.studyItem(id("nomu")))?.examples).toEqual([]);
    });

    it("ranks Level Candidates Editorial over List over Derived, ignoring unapproved and retired ones", async () => {
      expect((await cg.studyItem(id("taberu")))?.item.level).toBe("N5");
      expect((await cg.studyItem(id("nomu")))?.item.level).toBe("N4");
      expect((await cg.studyItem(id("chau")))?.item.level).toBeNull();
    });

    it("takes the newest of two Level Candidates of the same kind", async () => {
      expect((await cg.studyItem(id("teshimau")))?.item.level).toBe("N3");
    });
  });

  describe("levelList", () => {
    it("lists the visible Study Items of one type whose current level is that level", async () => {
      expect((await cg.levelList("N5", "word")).map((s) => s.label)).toEqual(["食べる"]);
      expect((await cg.levelList("N4", "word")).map((s) => s.label)).toEqual(["飲む"]);
      expect((await cg.levelList("N4", "kanji")).map((s) => s.label)).toEqual(["食"]);
      expect(await cg.levelList("N1", "grammar_point")).toEqual([]);
    });
  });

  describe("listeningClips", () => {
    it("lists the visible Listening Clips whose current level is that level", async () => {
      expect(await cg.listeningClips("N5")).toEqual([id("clipAtN5")]);
      expect(await cg.listeningClips("N1")).toEqual([]);
    });
  });

  describe("atLevel", () => {
    it("keeps the Study Items whose current level is that level, in the order given", async () => {
      expect(await cg.atLevel([id("clipAtN5"), id("nomu"), id("missing"), id("taberu"), id("chau")], "N5")).toEqual([id("clipAtN5"), id("taberu")]);
      expect(await cg.atLevel([id("nomu"), id("taberu")], "N4")).toEqual([id("nomu")]);
      expect(await cg.atLevel([], "N5")).toEqual([]);
    });
  });

  describe("search", () => {
    const labels = async (q: string, limit?: number) => (await cg.search(q, limit === undefined ? undefined : { limit })).map((s) => s.label);

    it("finds by written form, reading, gloss, Kanji meaning and Grammar title", async () => {
      expect(await labels("食べる")).toEqual(["食べる"]);
      expect(await labels("のむ")).toEqual(["飲む"]);
      expect(await labels("CONSUME")).toEqual(["食べる"]);
      expect(await labels("food")).toEqual(["食"]);
      expect(await labels("〜てしま")).toEqual(["〜てしまう"]);
    });

    it("puts exact matches before prefix matches before the rest", async () => {
      expect(await labels("eat")).toEqual(["食", "食べる"]);
      expect(await labels("食")).toEqual(["食", "食べる"]);
      expect(await labels("飲")).toEqual(["飲", "飲む"]);
    });

    it("reads a romaji query as kana too", async () => {
      expect(await labels("taberu")).toEqual(["食べる"]);
      expect(await labels(" NOMU ")).toEqual(["飲む"]);
    });

    it("matches the overridden text, not the text it replaced", async () => {
      expect(await labels("to devour")).toEqual([]);
      expect(await labels("to consume")).toEqual(["食べる"]);
    });

    it("never finds invisible Study Items or sub-entries", async () => {
      expect(await labels("draftword")).toEqual([]);
      expect(await labels("retired form")).toEqual([]);
    });

    it("returns nothing for a blank query and honours the limit", async () => {
      expect(await labels("  ")).toEqual([]);
      expect(await labels("to")).toEqual(["食べる", "飲む", "〜てしまう"]);
      expect(await labels("to", 1)).toHaveLength(1);
      expect(await labels("to", 0)).toEqual([]);
    });
  });
};

/** The same rows stored newest first, so no read can rely on the order rows come back in. */
const reversed = (graph: Graph): Graph =>
  Object.fromEntries(Object.entries(graph).map(([table, rows]) => [table, [...rows].reverse()])) as Graph;

describe.each([
  ["in ID order", g.graph],
  ["newest first", reversed(g.graph)],
])("rows stored %s", (_, graph) => {
  describe("fake content graph", () => {
    contract(async () => createFakeContentGraph(graph));
  });

  describe("content graph, against Postgres", () => {
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

  contract(async () => {
    await seedContentGraph(db, graph);
    return createContentGraph(db);
  });

  it("reads a list of ids longer than one query can name", async () => {
    const absent = Array.from({ length: 130_000 }, (_, i) => `10000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}` as StudyItemId);
    expect(await createContentGraph(db).atLevel([...absent, id("taberu")], "N5")).toEqual([id("taberu")]);
  }, 60_000);
  });
});
