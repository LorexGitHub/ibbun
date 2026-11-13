import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph, type Graph } from "@ibbun/content-graph/testing";
import type { QueueReason } from "@ibbun/content-graph/authoring";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@ibbun/llm";
import { DEFAULT_CONFIG } from "../../src/config.ts";
import { rubricFor } from "../../src/rubrics.ts";
import { REFRESH_REASONS, reviewRefreshFlags } from "./index.ts";

const slug = (reason: string) => reason.replaceAll(" ", "-");
const criteriaOf = (reason: string) => rubricFor(slug(reason), import.meta.dirname).criteria;

const answering = (reason: string, { fail = [] as string[], confidence = 0.95 } = {}) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: criteriaOf(reason).map((criterion) => ({ criterion, pass: !fail.includes(criterion), note: fail.includes(criterion) ? `${criterion} is off` : "fine" })),
    confidence,
    bothReadingsAcceptable: false,
  };
};

const world = () => {
  const graph: Graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const provenanceId = randomUUID();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life = (approval: "approved" | "draft" = "approved") => ({ approval, retired: false, provenanceId });

  const word = randomUUID();
  graph.studyItem.push({ id: word, type: "word", ...life() });
  graph.word.push({ studyItemId: word, priorityTags: [], usuallyKana: false });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: word, level: "N5", kind: "list", ...life() });
  const form = randomUUID();
  graph.wordForm.push({ id: form, wordId: word, position: 0, text: "水", ...life() });

  const override = async (state: "stale" | "orphaned") => {
    const id = randomUUID();
    graph.override.push({ id, recordId: form, field: "text", value: "お水", basedOn: "水", state, ...life() });
    return id;
  };
  const example = async () => {
    const sentence = randomUUID();
    const id = randomUUID();
    graph.sentence.push({ id: sentence, text: "水を飲む。", translationEn: "I drink water.", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life("draft") });
    graph.example.push({ id, sentenceId: sentence, studyItemId: word, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life("draft") });
    return id;
  };
  const flag = (reason: QueueReason, recordId: string, detail: unknown = {}) => a.enqueue({ reason, recordId, detail });
  const run = (reason: string, answer = answering(reason)) =>
    reviewRefreshFlags({ authoring: a, llm: createFakeLlm({ config: loadLlmConfig({}), answer }), config: DEFAULT_CONFIG });
  return { graph, a, word, override, example, flag, run };
};

const open = (w: ReturnType<typeof world>) => w.graph.queueEntry.filter((e) => !e.resolved).map((e) => e.reason);

describe("refresh flag rubrics", () => {
  it("has a rubric with criteria for every reason the reviewer handles", () => {
    for (const reason of REFRESH_REASONS) expect(criteriaOf(reason).length, reason).toBeGreaterThan(0);
  });

  it("keeps a stale override the reviewer approves, and resolves the flag", async () => {
    const w = world();
    const id = await w.override("stale");
    await w.flag("stale override", w.word, { overrideId: id, field: "text" });
    await w.run("stale override");
    expect(w.graph.override.find((o) => o.id === id)).toMatchObject({ state: "active", retired: false });
    expect(open(w)).toEqual([]);
  });

  it("retires, and never deletes, a stale override the reviewer rejects", async () => {
    const w = world();
    const id = await w.override("stale");
    await w.flag("stale override", w.word, { overrideId: id, field: "text" });
    await w.run("stale override", answering("stale override", { fail: ["still-needed"] }));
    expect(w.graph.override.find((o) => o.id === id)).toMatchObject({ state: "stale", retired: true });
    expect(open(w)).toEqual([]);
  });

  it("never moves an orphaned override to its suggested target: approval escalates instead", async () => {
    const w = world();
    const id = await w.override("orphaned");
    await w.flag("orphaned override", w.word, { overrideId: id, suggestedTarget: randomUUID() });
    await w.run("orphaned override");
    expect(w.graph.override.find((o) => o.id === id)).toMatchObject({ state: "orphaned", recordId: expect.any(String), retired: false });
    expect(open(w)).toEqual(["escalated"]);
  });

  it.each(["example redrafted", "superseded"] as const)("approves the Example behind a `%s` flag as a unit", async (reason) => {
    const w = world();
    const id = await w.example();
    await w.flag(reason, id);
    await w.run(reason);
    expect(w.graph.example.find((e) => e.id === id)!.approval).toBe("approved");
    expect(w.graph.sentence[0]!.approval).toBe("approved");
    expect(open(w)).toEqual([]);
  });

  it("rejects the Example behind a flag when a criterion fails", async () => {
    const w = world();
    const id = await w.example();
    await w.flag("example redrafted", id);
    await w.run("example redrafted", answering("example redrafted", { fail: ["translation"] }));
    expect(w.graph.example.find((e) => e.id === id)!.approval).toBe("rejected");
  });

  it("escalates a draft the reviewer is unsure about and leaves it a draft", async () => {
    const w = world();
    const id = await w.example();
    await w.flag("unmatched sense", id);
    await w.run("unmatched sense", answering("unmatched sense", { confidence: 0.2 }));
    expect(w.graph.example.find((e) => e.id === id)!.approval).toBe("draft");
    expect(open(w)).toContain("escalated");
    expect(open(w)).not.toContain("unmatched sense");
  });

  it("dismisses a level disagreement it approves, and writes no Level Candidate when it does not", async () => {
    const w = world();
    const before = w.graph.levelCandidate.length;
    w.graph.kanji.push({ studyItemId: w.word, literal: "水", meanings: [], onReadings: [], kunReadings: [], grade: 1, frequency: null, strokeCount: 4, components: [], strokes: [], knownWrongMeanings: [] });
    await w.flag("level disagreement", w.word, { old: 3 });
    await w.run("level disagreement");
    expect(open(w)).toEqual([]);
    await w.flag("level disagreement", w.word, { old: 3 });
    await w.run("level disagreement", answering("level disagreement", { fail: ["tanos-stands"] }));
    expect(open(w)).toEqual(["escalated"]);
    expect(w.graph.levelCandidate).toHaveLength(before);
  });

  it("approves a Japanese Explanation behind an `unmatched sense` flag", async () => {
    const w = world();
    const id = randomUUID();
    w.graph.japaneseExplanation.push({ id, wordSenseId: randomUUID(), grammarPointId: null, text: "みずのこと。", approval: "draft", retired: false, provenanceId: w.graph.provenance[0]!.id });
    await w.flag("unmatched sense", id, { senseId: randomUUID() });
    await w.run("unmatched sense");
    expect(w.graph.japaneseExplanation.find((e) => e.id === id)!.approval).toBe("approved");
  });

  it.each([
    ["superseded", "names no Example", {}],
    ["unmatched sense", "names no Example or Japanese Explanation", {}],
    ["stale override", "names no override", { overrideId: randomUUID() }],
  ] as const)("fails loudly on a `%s` flag that names nothing to review", async (reason, message, detail) => {
    const w = world();
    await w.flag(reason, reason === "stale override" ? w.word : randomUUID(), detail);
    await expect(w.run(reason)).rejects.toThrow(message);
  });

  it("leaves flags for other reasons alone and does nothing the second time", async () => {
    const w = world();
    await w.flag("suspended", w.word);
    const id = await w.example();
    await w.flag("superseded", id);
    expect(await w.run("superseded")).toHaveLength(1);
    expect(await w.run("superseded")).toHaveLength(0);
    expect(open(w)).toEqual(["suspended"]);
  });
});
