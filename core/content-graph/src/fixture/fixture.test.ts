import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { emptyGraph } from "../graph.ts";
import { createAuthoring, loadN5Fixture } from "../authoring/index.ts";
import { createFakeAuthoring, createFakeContentGraph, migrateContentGraph, n5Fixture } from "../testing.ts";
import { createContentGraph } from "../index.ts";

const { graph, ids } = n5Fixture();
const approved = <T extends { approval: string; retired: boolean }>(rows: T[]) => rows.filter((r) => r.approval === "approved" && !r.retired);

describe("the N5 fixture graph", () => {
  it("holds about ten each of N5 Kanji, Words and Grammar Points", () => {
    for (const type of ["kanji", "word", "grammar_point"] as const) expect(graph.studyItem.filter((s) => s.type === type)).toHaveLength(10);
    expect(new Set(graph.levelCandidate.map((l) => l.level))).toEqual(new Set(["N5"]));
  });

  it("is mojibun-owned content with fixture Provenance", () => {
    expect(graph.provenance).toEqual([expect.objectContaining({ source: { kind: "fixture" }, licence: "mojibun" })]);
  });

  it("gives every Study Item two approved Examples that meet the approval rule", () => {
    const explained = new Set(approved(graph.japaneseExplanation).flatMap((e) => [e.wordSenseId, e.grammarPointId]));
    const senseOf = new Map(graph.wordSense.map((s) => [s.wordId, s.id]));
    for (const item of graph.studyItem) {
      const examples = approved(graph.example).filter((e) => e.studyItemId === item.id);
      expect(examples.length, item.id).toBeGreaterThanOrEqual(2);
      for (const e of examples) {
        const sentence = graph.sentence.find((s) => s.id === e.sentenceId)!;
        expect(sentence.translationEn).toBeTruthy();
        const answer = graph.exampleAnswer.find((a) => a.exampleId === e.id && a.kind === "accepted")!;
        expect(sentence.text.slice(e.spanStart, e.spanEnd)).toBe(answer.written);
        expect(answer.reading).toMatch(/^[ぁ-ゖー]+$/);
        const explanationOf = item.type === "kanji" ? e.targetSenseId : item.type === "word" ? senseOf.get(item.id) : item.id;
        expect(explained.has(explanationOf ?? null), item.id).toBe(true);
      }
    }
  });

  it("links fixture Words to fixture Kanji at the same level", () => {
    expect(graph.wordContainsKanji).toHaveLength(10);
    expect(graph.wordContainsKanji).toContainEqual(expect.objectContaining({ wordId: ids.words["お金"], kanjiId: ids.kanji["金"], position: 1 }));
  });
});

describe("loadN5Fixture", () => {
  it("refuses in production", async () => {
    const target = emptyGraph();
    await expect(loadN5Fixture(createFakeAuthoring(target), { NODE_ENV: "production" })).rejects.toThrow(/production/);
    expect(target.studyItem).toHaveLength(0);
  });

  it("loads into the in-memory fake once, and the read interface serves it", async () => {
    const target = emptyGraph();
    const authoring = createFakeAuthoring(target);
    expect(await loadN5Fixture(authoring, { NODE_ENV: "test" })).toMatch(/30 Study Items/);
    expect(await loadN5Fixture(authoring, {})).toMatch(/already/);
    expect(target.studyItem).toHaveLength(30);
    const page = await createFakeContentGraph(target).studyItem(ids.words["水"]!);
    expect(page?.examples).toHaveLength(2);
    expect(await createFakeContentGraph(target).levelList("N5", "kanji")).toHaveLength(10);
  });
});

describe("loadN5Fixture over Postgres", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
  }, 120_000);
  afterAll(async () => {
    await db?.$client.end();
    await pg?.stop();
  });

  it("loads the same graph the fake holds", async () => {
    await loadN5Fixture(createAuthoring(db), { NODE_ENV: "development" });
    const reads = createContentGraph(db);
    expect(await reads.levelList("N5", "word")).toEqual(await createFakeContentGraph(graph).levelList("N5", "word"));
  });
});
