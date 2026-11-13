import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph, type Graph } from "@ibbun/content-graph/testing";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@ibbun/llm";
import { DEFAULT_CONFIG } from "../../src/config.ts";
import { rubricFor } from "../../src/rubrics.ts";
import { reviewAnswerFlags } from "./index.ts";

const criteria = rubricFor("flags").criteria;

const answering = ({ fail = [] as string[], confidence = 0.95 } = {}) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: criteria.map((criterion) => ({ criterion, pass: !fail.includes(criterion), note: fail.includes(criterion) ? `${criterion} is off` : "fine" })),
    confidence,
    bothReadingsAcceptable: false,
  };
};

const world = () => {
  const graph: Graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const provenanceId = randomUUID();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life = { approval: "approved" as const, retired: false, provenanceId };

  const word = randomUUID();
  graph.studyItem.push({ id: word, type: "word", ...life });
  graph.word.push({ studyItemId: word, priorityTags: [], usuallyKana: false });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: word, level: "N5", kind: "list", ...life });
  const sentence = randomUUID();
  graph.sentence.push({ id: sentence, text: "水を飲む。", translationEn: "I drink water.", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
  const example = randomUUID();
  graph.example.push({ id: example, sentenceId: sentence, studyItemId: word, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
  graph.exampleAnswer.push({ id: randomUUID(), exampleId: example, kind: "accepted", written: "水", reading: "みず", message: null, ...life });

  const flag = (input: string, recordId: string | null = example) =>
    a.enqueue({ reason: "answer flag", recordId, detail: { reviewId: randomUUID(), facet: "cloze", input } });
  const run = (answer = answering()) => reviewAnswerFlags({ authoring: a, llm: createFakeLlm({ config: loadLlmConfig({}), answer }), config: DEFAULT_CONFIG });
  const answers = () => graph.exampleAnswer.filter((x) => x.exampleId === example);
  const open = () => graph.queueEntry.filter((e) => !e.resolved).map((e) => e.reason);
  return { graph, a, example, flag, run, answers, open };
};

describe("answer flag rubric", () => {
  it("has criteria", () => {
    expect(criteria).toEqual(["correct", "target", "distinct", "exact"]);
  });

  it("adds one accepted answer, authored, when the flag is approved, and resolves the flag", async () => {
    const w = world();
    await w.flag("お水。");
    expect(await w.run()).toEqual([{ outcome: "approved" }]);
    const added = w.answers().filter((x) => x.written === "お水");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: "accepted", approval: "approved", retired: false });
    expect(w.graph.provenance.find((p) => p.id === added[0]!.provenanceId)!.source.kind).toBe("authored");
    expect(await w.a.decisions(added[0]!.id)).toMatchObject([{ outcome: "approved", decider: { kind: "reviewer", rubricVersion: "flags/v1" } }]);
    expect(w.open()).toEqual([]);
  });

  it("does not regrade: the Example and Sentence are untouched", async () => {
    const w = world();
    const before = structuredClone({ example: w.graph.example, sentence: w.graph.sentence });
    await w.flag("お水");
    await w.run();
    expect({ example: w.graph.example, sentence: w.graph.sentence }).toEqual(before);
  });

  it("records a rejected answer, never an accepted one, when a criterion fails", async () => {
    const w = world();
    await w.flag("みるく");
    await w.run(answering({ fail: ["target"] }));
    expect(w.answers().find((x) => x.written === "みるく")).toMatchObject({ approval: "rejected" });
    expect(w.open()).toEqual([]);
  });

  it("escalates a flag the reviewer is unsure about and leaves the answer a draft", async () => {
    const w = world();
    await w.flag("お水");
    await w.run(answering({ confidence: 0.2 }));
    expect(w.answers().find((x) => x.written === "お水")).toMatchObject({ approval: "draft" });
    expect(w.open()).toEqual(["escalated"]);
  });

  it("escalates, without asking the reviewer, an input that is already accepted", async () => {
    const w = world();
    await w.flag("みず");
    expect(await w.run()).toMatchObject([{ outcome: "escalated" }]);
    expect(w.answers()).toHaveLength(1);
    expect(w.open()).toEqual(["escalated"]);
  });

  it("escalates a flag whose facet has no Example", async () => {
    const w = world();
    await w.flag("水", null);
    await w.run();
    expect(w.open()).toEqual(["escalated"]);
  });

  it("fails loudly on a flag without its review, facet and input", async () => {
    const w = world();
    await w.a.enqueue({ reason: "answer flag", recordId: w.example, detail: {} });
    await expect(w.run()).rejects.toThrow("no review, facet and input");
  });

  it("leaves other reasons alone and does nothing the second time", async () => {
    const w = world();
    await w.flag("お水");
    await w.a.enqueue({ reason: "suspended", recordId: w.example });
    expect(await w.run()).toHaveLength(1);
    expect(await w.run()).toHaveLength(0);
    expect(w.open()).toEqual(["suspended"]);
  });
});
