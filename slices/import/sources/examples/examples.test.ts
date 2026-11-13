import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { approveDraftExamples, deriveExamples, EXAMPLES_PER_ITEM } from "./index.ts";

const build = () => {
  const graph = emptyGraph();
  graph.provenance.push({ id: "p", source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life = { approval: "approved" as const, retired: false, provenanceId: "p" };
  const word = (level: "N5" | "N4", form = "水") => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "word", ...life });
    graph.wordForm.push({ id: randomUUID(), wordId: id, position: 0, text: form, ...life });
    graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "editorial", ...life });
    return id;
  };
  const sentence = (text: string, approval: "draft" | "approved" = "draft") => {
    const id = randomUUID();
    graph.sentence.push({ id, text, translationEn: "t", tokens: [{ surface: text, reading: "ミズ", lemma: text, partOfSpeech: [], conjugationForm: null, start: 0, end: text.length }], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life, approval });
    return id;
  };
  const use = (sentenceId: string, wordId: string, end: number) =>
    graph.sentenceUsesWord.push({ id: randomUUID(), sentenceId, wordId, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: end, ...life, approval: "draft" });
  const tokenised = (text: string) => {
    const id = sentence(text);
    graph.sentence.find((x) => x.id === id)!.tokens = [{ surface: "水", reading: "ミズ", lemma: "水", partOfSpeech: [], conjugationForm: null, start: 0, end: 1 }];
    return id;
  };
  return { graph, word, sentence, tokenised, use, authoring: createFakeAuthoring(graph) };
};

describe("Tatoeba Examples", () => {
  it("drafts the shortest Sentences for an N5 Word, with an answer from the tokens, and skips other levels", async () => {
    const w = build();
    const water = w.word("N5"), later = w.word("N4");
    for (const text of ["水", "水を飲む", "水が冷たい", "水は大切です", "水を一杯ください"]) w.tokenised(text);
    const report = await deriveExamples(w);
    expect(report).toEqual({ items: 1, drafted: EXAMPLES_PER_ITEM, uncovered: 0 });
    const examples = w.graph.example;
    expect(examples.every((e) => e.studyItemId === water && e.approval === "draft")).toBe(true);
    expect(w.graph.exampleAnswer[0]).toMatchObject({ kind: "accepted", written: "水", reading: "みず", approval: "draft" });
  });

  it("counts an item with no Sentence as uncovered, and a rerun adds nothing", async () => {
    const w = build();
    w.word("N5");
    w.word("N5", "火");
    w.tokenised("水");
    expect(await deriveExamples(w)).toEqual({ items: 2, drafted: 1, uncovered: 1 });
    expect(await deriveExamples(w)).toEqual({ items: 1, drafted: 0, uncovered: 1 });
  });

  it("approves the unit: Sentence, links, answer and Example", async () => {
    const w = build();
    const water = w.word("N5");
    w.tokenised("水");
    await deriveExamples(w);
    expect(await approveDraftExamples(w)).toBe(1);
    expect(await w.authoring.isSuspended(water)).toBe(false);
    expect(w.graph.sentence[0]!.approval).toBe("approved");
    expect(w.graph.exampleAnswer[0]!.approval).toBe("approved");
  });
});
