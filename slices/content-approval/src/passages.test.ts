import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import type { MatcherRule } from "@ibbun/content-graph/authoring";
import { textItems } from "./passages.ts";

const world = () => {
  const graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  graph.provenance.push({ id: "p1", source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const ok = { approval: "approved" as const, retired: false, provenanceId: "p1" };
  const word = (forms: string[], readings: string[] = []) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "word", ...ok });
    graph.word.push({ studyItemId: id, priorityTags: [], usuallyKana: false });
    forms.forEach((text, position) => graph.wordForm.push({ id: randomUUID(), wordId: id, position, text, ...ok }));
    readings.forEach((text, position) => graph.wordReading.push({ id: randomUUID(), wordId: id, position, text, pitchAccent: null, ...ok }));
    return id;
  };
  const kanji = (literal: string | null) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "kanji", ...ok });
    if (literal) graph.kanji.push({ studyItemId: id, literal, meanings: [], onReadings: [], kunReadings: [], grade: null, frequency: null, strokeCount: 1, components: [], strokes: [], knownWrongMeanings: [] });
    return id;
  };
  const point = (rule: MatcherRule | null) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "grammar_point", ...ok });
    graph.grammarPoint.push({ studyItemId: id, title: "〜を飲む", forms: [], formation: [], register: "neutral", meaning: "to drink something", notes: null, matcherRule: rule });
    return id;
  };
  return { graph, a, word, kanji, point };
};

describe("textItems", () => {
  it("reads a Word as its first spelling plus the rest, forms before readings, deduplicated", async () => {
    const w = world();
    const id = w.word(["呑む", "飲む"], ["のむ", "のむ"]);
    expect(await textItems(w.a, [id])).toEqual([{ type: "word", id, lemma: "呑む", spellings: ["飲む", "のむ"] }]);
  });

  it("leaves out a Word with no spelling at all", async () => {
    const w = world();
    expect(await textItems(w.a, [w.word([])])).toEqual([]);
  });

  it("reads a Kanji by its literal, and leaves one without a kanji row out", async () => {
    const w = world();
    expect(await textItems(w.a, [w.kanji("水"), w.kanji(null)])).toEqual([{ type: "kanji", id: expect.any(String), literal: "水" }]);
  });

  it("reads a Grammar Point by its Matcher Rule, and leaves one without a rule out", async () => {
    const w = world();
    const rule: MatcherRule = { pattern: [{ lemma: "飲む" }] };
    expect(await textItems(w.a, [w.point(rule), w.point(null)])).toEqual([{ type: "grammar_point", id: expect.any(String), rule }]);
  });

  it("skips Study Items it does not know", async () => {
    const w = world();
    expect(await textItems(w.a, [randomUUID()])).toEqual([]);
  });
});
