import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph, type Graph } from "@mojibun/content-graph/testing";
import { ContentGenerate, ContentReview } from "@mojibun/content-graph/jobs";
import { MAX_ATTEMPTS } from "@mojibun/content-graph/authoring";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@mojibun/llm";
import { createFakeNlp, type Token } from "@mojibun/nlp";
import { DEFAULT_CONFIG } from "./config.ts";
import { createFakeProgress } from "@mojibun/progress/testing";
import { DEFAULT_SAMPLING } from "../sampling/config.ts";
import { createSampling } from "../sampling/sampler.ts";
import { createMemoryStore } from "../sampling/store.ts";
import { reviewRun } from "./review-job.ts";
import { handler } from "@mojibun/jobs";

const noun = (surface: string, reading: string): Token => ({ surface, lemma: surface, reading, partOfSpeech: ["名詞", "普通名詞", "一般"], conjugation: null });
const lexicon: Token[] = [
  noun("水", "ミズ"),
  { surface: "を", lemma: "を", reading: "ヲ", partOfSpeech: ["助詞", "格助詞"], conjugation: null },
  { surface: "飲む", lemma: "飲む", reading: "ノム", partOfSpeech: ["動詞", "一般"], conjugation: { type: "五段-マ行", form: "終止形-一般" } },
  { surface: "。", lemma: "。", reading: "。", partOfSpeech: ["補助記号", "句点"], conjugation: null },
  { surface: "Water", lemma: "Water", reading: "Water", partOfSpeech: ["名詞", "普通名詞", "一般"], conjugation: null },
];

const PASS = ["natural", "translation", "target-sense", "reading", "blank", "answer-data"];
const approving = (overrides: Partial<{ failing: string[]; confidence: number; bothReadingsAcceptable: boolean }> = {}) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: PASS.map((criterion) => ({ criterion, pass: !overrides.failing?.includes(criterion), note: overrides.failing?.includes(criterion) ? `${criterion} is off` : "fine" })),
    confidence: overrides.confidence ?? 0.95,
    bothReadingsAcceptable: overrides.bothReadingsAcceptable ?? false,
  };
};

type Options = {
  text?: string;
  translation?: string | null;
  reading?: string;
  attempts?: number;
  kind?: string;
  explanation?: string;
  /** What the Example or explanation is about; a word (水) unless said. */
  item?: "word" | "grammar" | "kanji";
  rule?: unknown;
  span?: [number, number];
  /** Kanji the explanation text may use: literal and KANJIDIC2 grade. */
  kanji?: { literal: string; grade: number | null };
  answerMessage?: string;
};

/** A request with one drafted Example for 水 (「水を飲む。」), the Words it needs and a Generation Run that wrote it. */
const world = async (options: Options = {}) => {
  const graph: Graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const life = (provenanceId: string, approval: "approved" | "draft" = "approved") => ({ approval, retired: false, provenanceId });
  const authored = randomUUID();
  graph.provenance.push({ id: authored, source: { kind: "authored", by: "test" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });

  const word = (form: string) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "word", ...life(authored) });
    graph.word.push({ studyItemId: id, priorityTags: [] });
    graph.wordForm.push({ id: randomUUID(), wordId: id, position: 0, text: form, ...life(authored) });
    graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level: "N5", kind: "list", ...life(authored) });
    return id;
  };
  const water = word("水");
  word("飲む");
  const targetId = (() => {
    if (options.item === "grammar") {
      const id = randomUUID();
      graph.studyItem.push({ id, type: "grammar_point", ...life(authored) });
      const rule = "rule" in options ? options.rule : { pattern: [{ lemma: "飲む" }] };
      graph.grammarPoint.push({ studyItemId: id, title: "〜を飲む", forms: [{ text: "を飲む", register: "casual" }], formation: [], register: "neutral", meaning: "to drink something", notes: null, matcherRule: rule });
      graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level: "N5", kind: "list", ...life(authored) });
      return id;
    }
    if (options.item === "kanji") {
      const id = randomUUID();
      graph.studyItem.push({ id, type: "kanji", ...life(authored) });
      return id;
    }
    return water;
  })();
  if (options.kanji) {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "kanji", ...life(authored) });
    graph.kanji.push({ studyItemId: id, literal: options.kanji.literal, meanings: [], onReadings: [], kunReadings: [], grade: options.kanji.grade, frequency: null, strokeCount: 1, components: [], strokes: [], knownWrongMeanings: [] });
  }

  const request = await a.requestGeneration({ targetId, kind: options.kind ?? "examples", reason: "test" });
  for (let i = 0; i < (options.attempts ?? 0); i++) await a.failAttempt(request.id);
  const run = await a.recordGenerationRun({ requestId: request.id, model: "claude-sonnet-5-5", promptTemplateVersion: "p1", inputs: [water], tokens: 100, cost: 0.001 });
  const generated = randomUUID();
  graph.provenance.push({ id: generated, source: { kind: "generated", model: "claude-sonnet-5-5", promptTemplateVersion: "p1", generationRunId: run.id }, licence: "mojibun", author: null, sourceUrl: null, inputs: [water] });

  const sentence = randomUUID();
  const example = randomUUID();
  const text = options.text ?? "水を飲む。";
  graph.sentence.push({ id: sentence, text, translationEn: options.translation === undefined ? "I drink water." : options.translation, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life(generated, "draft") });
  const [spanStart, spanEnd] = options.span ?? [0, 1];
  graph.example.push({ id: example, sentenceId: sentence, studyItemId: targetId, spanStart, spanEnd, targetSenseId: null, hint: "water", comprehensionQuestion: null, ...life(generated, "draft") });
  graph.exampleAnswer.push({ id: randomUUID(), exampleId: example, kind: "accepted", written: "水", reading: options.reading ?? "みず", message: options.answerMessage ?? null, ...life(generated, "draft") });

  if (options.explanation !== undefined) {
    const sense = randomUUID();
    graph.wordSense.push({ id: sense, wordId: water, position: 0, partsOfSpeech: ["n"], glosses: ["water"], ...life(authored) });
    const grammar = options.item === "grammar";
    graph.japaneseExplanation.push({ id: randomUUID(), wordSenseId: grammar ? null : sense, grammarPointId: grammar ? targetId : null, text: options.explanation, ...life(generated, "draft") });
  }
  return { graph, a, request, run, sentence, example, water, targetId };
};

const sampling = (authoring: World["a"], jobs: ReturnType<typeof createFakeJobs>, store = createMemoryStore()) =>
  createSampling({ store, authoring, progress: createFakeProgress(), jobs, config: DEFAULT_SAMPLING });

const run = async (w: World, answer: (call: FakeLlmCall) => unknown = approving(), store = createMemoryStore()) => {
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer });
  const deps = { authoring: w.a, nlp: createFakeNlp(lexicon), llm, jobs, config: DEFAULT_CONFIG, sampling: sampling(w.a, jobs, store) };
  const generated: unknown[] = [];
  await jobs.work([handler(ContentGenerate, async (p) => void generated.push(p)), handler(ContentReview, (p) => reviewRun(deps, p))]);
  await jobs.enqueue(ContentReview, { requestId: w.request.id, runId: w.run.id });
  await jobs.drain();
  return { llm, deps, generated };
};

const explanationVerdicts = () => ({
  verdicts: ["accurate", "natural", "level", "distinct"].map((criterion) => ({ criterion, pass: true, note: "ok" })),
  confidence: 0.9,
  bothReadingsAcceptable: false,
});

const exampleRow = (w: World) => w.graph.example.find((e) => e.id === w.example)!;
const requestRow = (w: World) => w.graph.generationRequest.find((r) => r.id === w.request.id)!;

type World = Awaited<ReturnType<typeof world>>;

describe("content.review and spot-check sampling", () => {
  it("draws the reviewer's approval for the supervisor to sample and still approves it at once", async () => {
    const w = await world();
    const { deps } = await run(w);
    expect(exampleRow(w).approval).toBe("approved");
    expect(await deps.sampling.samples({ status: "pending" })).toMatchObject([
      { kind: "example", reason: "calibration", primary: { table: "example", id: w.example }, requestId: w.request.id, model: "claude-opus-5-5" },
    ]);
  });

  it("holds the approval for the supervisor while its kind is paused: the draft stays a draft and the request waits", async () => {
    const w = await world();
    const store = createMemoryStore();
    await store.saveState({ ...(await store.state("example")), paused: true });
    const { deps } = await run(w, approving(), store);
    expect(exampleRow(w).approval).toBe("draft");
    expect(w.graph.sentence.find((s) => s.id === w.sentence)!.approval).toBe("draft");
    expect(requestRow(w).status).toBe("in review");
    expect(await deps.sampling.samples({ status: "pending" })).toMatchObject([{ reason: "held", primary: { id: w.example } }]);
  });

  it("does not hold a reviewer rejection or escalation, only approvals", async () => {
    const w = await world();
    const store = createMemoryStore();
    await store.saveState({ ...(await store.state("example")), paused: true });
    await run(w, approving({ failing: ["natural"] }), store);
    expect(exampleRow(w).approval).toBe("rejected");
  });
});

describe("content.review", () => {
  it("stores Sudachi tokens, approves a good draft as a unit and finishes the request", async () => {
    const w = await world();
    const { llm } = await run(w);
    const sentence = w.graph.sentence.find((s) => s.id === w.sentence)!;
    expect(sentence.tokens.map((t) => [t.surface, t.start, t.end])).toEqual([["水", 0, 1], ["を", 1, 2], ["飲む", 2, 4], ["。", 4, 5]]);
    expect(exampleRow(w).approval).toBe("approved");
    expect(sentence.approval).toBe("approved");
    expect(w.graph.exampleAnswer.every((x) => x.approval === "approved")).toBe(true);
    expect(sentence.tokens.map((t) => t.conjugationForm)).toEqual([null, null, "終止形-一般", null]);
    expect(requestRow(w).status).toBe("done");
    expect(llm.calls()).toHaveLength(1);
    expect(llm.calls()[0]!.prompt).toContain("Reading disagreements between the generator and Sudachi:\nnone");
    const [decision] = await w.a.decisions(w.example);
    expect(decision).toMatchObject({ outcome: "approved", decider: { kind: "reviewer", model: "claude-opus-5-5", rubricVersion: "example/v2" } });
    expect(decision!.verdicts.map((v) => v.criterion)).toEqual(PASS);
  });

  it("sends a check failure back to the generator as feedback without calling the reviewer", async () => {
    const w = await world({ translation: null });
    const { llm, generated } = await run(w);
    expect(llm.calls()).toHaveLength(0);
    expect(exampleRow(w).approval).toBe("rejected");
    expect((await w.a.decisions(w.example))[0]).toMatchObject({ outcome: "rejected", decider: { kind: "derived" } });
    expect(requestRow(w)).toMatchObject({ attempts: 1, status: "open" });
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "translation: The English translation is missing." }]);
  });

  it("rejects when the reviewer fails a criterion, with its reason as feedback, and never edits the draft", async () => {
    const w = await world();
    const { generated } = await run(w, approving({ failing: ["natural"] }));
    expect(exampleRow(w).approval).toBe("rejected");
    expect(w.graph.sentence.find((s) => s.id === w.sentence)!.text).toBe("水を飲む。");
    expect(requestRow(w).attempts).toBe(1);
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "natural: natural is off" }]);
  });

  it("escalates a low-confidence verdict: the draft stays a draft and the supervisor gets it", async () => {
    const w = await world();
    const { generated } = await run(w, approving({ confidence: 0.3 }));
    expect(exampleRow(w).approval).toBe("draft");
    expect((await w.a.queue({ reason: "escalated" })).map((e) => e.recordId)).toEqual([w.example]);
    expect(requestRow(w).status).toBe("in review");
    expect(generated).toEqual([]);
  });

  it("escalates when two readings are both acceptable", async () => {
    const w = await world();
    await run(w, approving({ bothReadingsAcceptable: true }));
    expect((await w.a.decisions(w.example))[0]).toMatchObject({ outcome: "escalated", reason: "two readings are both acceptable" });
  });

  it("shows the reviewer a reading disagreement without failing the draft", async () => {
    const w = await world({ reading: "すい" });
    const { llm } = await run(w);
    expect(llm.calls()[0]!.prompt).toContain("generator すい, Sudachi みず");
    expect(exampleRow(w).approval).toBe("approved");
  });

  it("never lets the reviewer see more than the draft and its rubric", async () => {
    const w = await world();
    const { llm } = await run(w);
    const [call] = llm.calls();
    expect(call).toMatchObject({ role: "reviewer" });
    expect(call!.prompt).toContain("水を飲む。");
    expect(call!.prompt).toContain("I drink water.");
  });

  it("fails the request after the last attempt and queues it as generation failed, without a new job", async () => {
    const w = await world({ attempts: MAX_ATTEMPTS - 1, translation: null });
    const { generated } = await run(w);
    expect(requestRow(w).status).toBe("failed");
    expect((await w.a.queue({ reason: "generation failed" })).map((e) => e.generationRequestId)).toEqual([w.request.id]);
    expect(generated).toEqual([]);
  });

  it("does nothing again for a request that is done", async () => {
    const w = await world();
    const first = await run(w);
    await reviewRun(first.deps, { requestId: w.request.id, runId: w.run.id });
    expect(first.llm.calls()).toHaveLength(1);
    expect(await w.a.decisions(w.example)).toHaveLength(1);
  });

  it("rejects a run that wrote no draft while the request is still open", async () => {
    const w = await world();
    const { deps } = await run(w);
    const other = await world();
    await expect(reviewRun({ ...deps, authoring: other.a }, { requestId: other.request.id, runId: randomUUID() })).rejects.toThrow(/wrote no draft/);
  });

  it("rejects a request kind it has no rubric for", async () => {
    const w = await world({ kind: "reading_passage" });
    const jobs = createFakeJobs();
    const llm = createFakeLlm({ config: loadLlmConfig({}), answer: approving() });
    await expect(reviewRun({ authoring: w.a, nlp: createFakeNlp(lexicon), llm, jobs, config: DEFAULT_CONFIG, sampling: sampling(w.a, jobs) }, { requestId: w.request.id, runId: w.run.id })).rejects.toThrow(/no rubric/);
  });

  it("fails a Japanese Explanation that uses Latin letters or its headword, and approves a clean one", async () => {
    const bad = await world({ kind: "japanese_explanation", explanation: "水 is water" });
    const clean = await world({ kind: "japanese_explanation", explanation: "のむことができる、いろのないもの。" });
    const badRun = await run(bad, explanationVerdicts);
    expect(badRun.llm.calls()).toHaveLength(0);
    expect(bad.graph.japaneseExplanation[0]!.approval).toBe("rejected");
    expect((await bad.a.decisions(bad.graph.japaneseExplanation[0]!.id))[0]!.reason).toMatch(/latin[\s\S]*headword/);
    await run(clean, explanationVerdicts);
    expect(clean.graph.japaneseExplanation[0]!.approval).toBe("approved");
    expect((await clean.a.decisions(clean.graph.japaneseExplanation[0]!.id))[0]!.decider).toMatchObject({ rubricVersion: "japanese-explanation/v1" });
  });

  it("checks a Grammar Point Example with its Matcher Rule: one match at the claimed span", async () => {
    const good = await world({ item: "grammar", span: [2, 4] });
    await run(good);
    expect(exampleRow(good).approval).toBe("approved");

    const wrongSpan = await world({ item: "grammar", span: [0, 1] });
    const { generated } = await run(wrongSpan);
    expect(exampleRow(wrongSpan).approval).toBe("rejected");
    expect(generated).toEqual([{ requestId: wrongSpan.request.id, feedback: expect.stringContaining("target span 0–1") }]);
  });

  it("cannot check a Grammar Point Example whose Grammar Point has no Matcher Rule", async () => {
    const w = await world({ item: "grammar", rule: null });
    await expect(run(w)).rejects.toThrow(/has no Matcher Rule/);
  });

  it("has no automatic checks for a Kanji Example yet", async () => {
    const w = await world({ item: "kanji" });
    await expect(run(w)).rejects.toThrow(/no automatic checks for Examples of a kanji Study Item/);
  });

  it("shows the reviewer the answer data, with each answer's message", async () => {
    const w = await world({ answerMessage: "plain water" });
    const { llm } = await run(w);
    expect(llm.calls()[0]!.prompt).toContain("- accepted: 水 (みず) — plain water");
  });

  it("holds a Grammar Point explanation to the Grammar Point's own title and forms", async () => {
    const w = await world({ item: "grammar", kind: "japanese_explanation", explanation: "〜を飲むは、のむことです。" });
    const { llm } = await run(w, explanationVerdicts);
    expect(llm.calls()).toHaveLength(0);
    expect((await w.a.decisions(w.graph.japaneseExplanation[0]!.id))[0]!.reason).toContain("headword");
  });

  it("allows a Kanji in an explanation when it is jōyō, and fails one that is neither levelled nor jōyō", async () => {
    const joyo = await world({ kind: "japanese_explanation", explanation: "いろのないもの。色はない。", kanji: { literal: "色", grade: 2 } });
    const unknown = await world({ kind: "japanese_explanation", explanation: "いろのないもの。色はない。", kanji: { literal: "色", grade: null } });
    await run(joyo, explanationVerdicts);
    await run(unknown, explanationVerdicts);
    expect(joyo.graph.japaneseExplanation[0]!.approval).toBe("approved");
    expect(unknown.graph.japaneseExplanation[0]!.approval).toBe("rejected");
    expect((await unknown.a.decisions(unknown.graph.japaneseExplanation[0]!.id))[0]!.reason).toContain("「色」");
  });

  const addSentence = (w: World, text: string, over: { approval: "approved" | "draft"; retired: boolean }) =>
    w.graph.sentence.push({ ...w.graph.sentence.find((x) => x.id === w.sentence)!, id: randomUUID(), text, ...over });

  it("rejects a near-duplicate of an approved Sentence", async () => {
    const w = await world();
    addSentence(w, "水を飲む！", { approval: "approved", retired: false });
    const { generated } = await run(w);
    expect(generated).toEqual([{ requestId: w.request.id, feedback: expect.stringContaining("duplicate: Too close to the existing Sentence 「水を飲む！」") }]);
  });

  it("does not count a draft or a retired Sentence as a duplicate", async () => {
    const w = await world();
    addSentence(w, "水を飲む！", { approval: "draft", retired: false });
    addSentence(w, "水を飲む？", { approval: "approved", retired: true });
    await run(w);
    expect(exampleRow(w).approval).toBe("approved");
  });

  it("rejects a Sentence with a content word that links to no JMdict Word", async () => {
    const w = await world({ text: "Waterを飲む。", span: [0, 5] });
    const { generated } = await run(w);
    expect(generated).toEqual([{ requestId: w.request.id, feedback: expect.stringContaining("word-link:") }]);
  });

  it("checks an Example of an Unlevelled target at N1", async () => {
    const w = await world();
    w.graph.levelCandidate = w.graph.levelCandidate.filter((c) => c.studyItemId !== w.water);
    const { llm } = await run(w);
    expect(llm.calls()[0]!.prompt).toContain("JLPT Level of the target: N1");
    expect(exampleRow(w).approval).toBe("approved");
  });

  it("tells the reviewer when there is no hint and no answer data", async () => {
    const w = await world();
    exampleRow(w).hint = null;
    w.graph.exampleAnswer.length = 0;
    const { llm } = await run(w);
    expect(llm.calls()[0]!.prompt).toContain("Hint: none");
    expect(llm.calls()[0]!.prompt).toContain("Answer data:\nnone");
    expect(exampleRow(w).approval).toBe("approved");
  });

  it("cannot check a Grammar Point Example without its Grammar Point, or an Example without its Study Item", async () => {
    const noPoint = await world({ item: "grammar" });
    noPoint.graph.grammarPoint.length = 0;
    await expect(run(noPoint)).rejects.toThrow(/has no Matcher Rule/);
    const noItem = await world();
    noItem.graph.studyItem = noItem.graph.studyItem.filter((i) => i.id !== noItem.targetId);
    await expect(run(noItem)).rejects.toThrow(/Examples of a missing Study Item/);
  });

  it("does nothing for a request that has already failed", async () => {
    const w = await world();
    requestRow(w).status = "failed";
    const { llm } = await run(w);
    expect(llm.calls()).toHaveLength(0);
    expect(exampleRow(w).approval).toBe("draft");
  });

  it.each([
    [1, "approved"],
    [8, "approved"],
    [0, "rejected"],
    [9, "rejected"],
    [null, "rejected"],
  ])("treats a Kanji of KANJIDIC2 grade %s as jōyō only for grades 1 to 8 (%s)", async (grade, expected) => {
    const w = await world({ kind: "japanese_explanation", explanation: "いろの色。", kanji: { literal: "色", grade } });
    await run(w, explanationVerdicts);
    expect(w.graph.japaneseExplanation[0]!.approval).toBe(expected);
  });

  it("tells the reviewer when the explained item is Unlevelled", async () => {
    const w = await world({ kind: "japanese_explanation", explanation: "のむことができる、いろのないもの。" });
    w.graph.levelCandidate = w.graph.levelCandidate.filter((c) => c.studyItemId !== w.water);
    const { llm } = await run(w, explanationVerdicts);
    expect(llm.calls()[0]!.prompt).toContain("JLPT Level of the target: Unlevelled");
    expect(llm.calls()[0]!.prompt).toContain("Known meaning (English): water");
  });

  it("cannot check an explanation whose Word sense or Grammar Point is gone, or that explains nothing", async () => {
    const noSense = await world({ kind: "japanese_explanation", explanation: "x" });
    noSense.graph.wordSense.length = 0;
    await expect(run(noSense)).rejects.toThrow(/no Word sense/);
    const noPoint = await world({ kind: "japanese_explanation", explanation: "x", item: "grammar" });
    noPoint.graph.grammarPoint.length = 0;
    await expect(run(noPoint)).rejects.toThrow(/no Grammar Point/);
    const nothing = await world({ kind: "japanese_explanation", explanation: "x" });
    nothing.graph.japaneseExplanation[0]!.wordSenseId = null;
    await expect(run(nothing)).rejects.toThrow(/explains nothing/);
  });
});
