import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Row } from "@mojibun/content-graph/authoring";
import { createFakeAuthoring, emptyGraph } from "@mojibun/content-graph/testing";
import { ContentGenerate, ContentReview } from "@mojibun/content-graph/jobs";
import { createFakeJobs, handler } from "@mojibun/jobs";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@mojibun/llm";
import { createFakeNlp } from "@mojibun/nlp";
import { createFakeProgress } from "@mojibun/progress/testing";
import { DEFAULT_CONFIG } from "../../src/config.ts";
import { grammarFieldsDrafts, grammarFieldsValues } from "./index.ts";
import { rubricFor } from "../../src/rubrics.ts";
import { reviewRun } from "../../src/review-job.ts";
import { DEFAULT_SAMPLING } from "../../sampling/config.ts";
import { createSampling } from "../../sampling/sampler.ts";
import { createMemoryStore } from "../../sampling/store.ts";

const CRITERIA = ["title", "forms", "formation", "register", "meaning", "level", "matcher-rule", "links"];

const token = (surface: string, lemma: string, start: number) => ({ surface, lemma, reading: surface, partOfSpeech: ["動詞"], conjugationForm: null, start, end: start + surface.length });

/** A drafted Grammar Point 〜てしまう with one tokenised example Sentence and one proposed link. */
const world = async (point: Partial<Row<"grammarPoint">> = {}) => {
  const graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const authored = randomUUID();
  const life = (provenanceId: string, approval: "approved" | "draft" = "approved") => ({ approval, retired: false, provenanceId });
  graph.provenance.push({ id: authored, source: { kind: "authored", by: "test" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
  const item = randomUUID();
  graph.studyItem.push({ id: item, type: "grammar_point", ...life(authored, "draft") });
  graph.grammarPoint.push({ studyItemId: item, ...fields(), ...point });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: item, level: "N4", kind: "list", ...life(authored) });
  const sentence = randomUUID();
  graph.sentence.push({
    id: sentence, text: "食べてしまった。", translationEn: "I ate it all.", audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life(authored),
    tokens: [token("食べ", "食べる", 0), token("て", "て", 2), token("しまっ", "しまう", 3), token("た", "た", 6)],
  });
  graph.example.push({ id: randomUUID(), sentenceId: sentence, studyItemId: item, spanStart: 0, spanEnd: 6, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life(authored) });
  const link = randomUUID();
  graph.sentenceDemonstratesGrammar.push({ id: link, sentenceId: sentence, grammarPointId: item, spanStart: 0, spanEnd: 6, ...life(authored, "draft") });
  const request = await a.requestGeneration({ targetId: item, kind: "grammar-fields", reason: "test" });
  const run = await a.recordGenerationRun({ requestId: request.id, model: "claude-sonnet-5-5", promptTemplateVersion: "grammar-fields/1", inputs: [item], tokens: 100, cost: 0.001 });
  return { graph, a, item, link, request, run };
};

const fields = () => ({
  title: "〜てしまう",
  forms: [{ text: "てしまう", register: "polite" as const }, { text: "ちゃう", register: "casual" as const }],
  formation: ["V-て", "しまう"],
  register: "neutral" as const,
  meaning: "to do something completely or regrettably",
  notes: null,
  matcherRule: { pattern: [{ lemma: "て" }, { lemma: "しまう" }] },
});

const verdicts = (failing: string[] = []) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: CRITERIA.map((criterion) => ({ criterion, pass: !failing.includes(criterion), note: failing.includes(criterion) ? `${criterion} is off` : "ok" })),
    confidence: 0.95,
    bothReadingsAcceptable: false,
  };
};

const review = async (w: Awaited<ReturnType<typeof world>>, answer = verdicts()) => {
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer });
  const sampling = createSampling({ store: createMemoryStore(), authoring: w.a, progress: createFakeProgress(), jobs, config: DEFAULT_SAMPLING });
  const deps = { authoring: w.a, nlp: createFakeNlp([]), llm, jobs, config: DEFAULT_CONFIG, sampling };
  const generated: unknown[] = [];
  await jobs.work([handler(ContentGenerate, async (p) => void generated.push(p)), handler(ContentReview, (p) => reviewRun(deps, p))]);
  await jobs.enqueue(ContentReview, { requestId: w.request.id, runId: w.run.id });
  await jobs.drain();
  return { llm, generated };
};

const itemRow = (w: Awaited<ReturnType<typeof world>>) => w.graph.studyItem.find((i) => i.id === w.item)!;
const linkRow = (w: Awaited<ReturnType<typeof world>>) => w.graph.sentenceDemonstratesGrammar.find((l) => l.id === w.link)!;

describe("the grammar-fields rubric", () => {
  it("is a versioned template that judges every field, the rule and the proposed links", () => {
    expect(rubricFor("grammar-fields")).toMatchObject({ version: "grammar-fields/v1", criteria: CRITERIA });
  });

  it("shows the reviewer the fields, the rule and each proposed link with the span it matched", async () => {
    const w = await world();
    const { llm } = await review(w);
    const prompt = llm.calls()[0]!.prompt;
    expect(prompt).toContain("Title: 〜てしまう");
    expect(prompt).toContain("Forms: てしまう (polite)、ちゃう (casual)");
    expect(prompt).toContain("Formation: V-て + しまう");
    expect(prompt).toContain('{"pattern":[{"lemma":"て"},{"lemma":"しまう"}]}');
    expect(prompt).toContain("- 食べてしまった。 (I ate it all.) 「食べてしまっ」");
    expect(prompt).toContain("JLPT Level of the target: N4");
  });
});

describe("reviewing Grammar Point fields", () => {
  it("approves the point and its proposed links together and finishes the request", async () => {
    const w = await world();
    await review(w);
    expect(itemRow(w).approval).toBe("approved");
    expect(linkRow(w).approval).toBe("approved");
    expect(w.graph.generationRequest.find((r) => r.id === w.request.id)!.status).toBe("done");
    expect((await w.a.decisions(w.item))[0]).toMatchObject({ outcome: "approved", decider: { kind: "reviewer", rubricVersion: "grammar-fields/v1" } });
  });

  it("rejects a link that uses another meaning of the spelling, and sends the reason back to the generator", async () => {
    const w = await world();
    const { generated } = await review(w, verdicts(["links"]));
    expect(itemRow(w).approval).toBe("rejected");
    expect(linkRow(w).approval).toBe("rejected");
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "links: links is off" }]);
  });

  it("rejects a rule that misses one of the point's own example Sentences without calling the reviewer", async () => {
    const w = await world({ matcherRule: { pattern: [{ lemma: "行く" }] } });
    const { llm, generated } = await review(w);
    expect(llm.calls()).toHaveLength(0);
    expect(itemRow(w).approval).toBe("rejected");
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "matcher-rule: The rule does not match the example 「食べてしまった。」." }]);
  });

  it("rejects a point with a required field missing", async () => {
    const w = await world({ meaning: "", matcherRule: null });
    const { llm, generated } = await review(w);
    expect(llm.calls()).toHaveLength(0);
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "required-field: The English meaning is missing.\nrequired-field: There is no Matcher Rule." }]);
  });

  it("redrafts a point whose earlier fields were rejected", async () => {
    const w = await world();
    itemRow(w).approval = "rejected";
    await review(w);
    expect(itemRow(w).approval).toBe("approved");
  });
});

describe("grammarFieldsDrafts", () => {
  it("finds nothing once the point is approved, or when the target is not a Grammar Point", async () => {
    const approved = await world();
    itemRow(approved).approval = "approved";
    expect(await grammarFieldsDrafts(approved.a, approved.run.id)).toEqual([]);
    const word = await world();
    itemRow(word).type = "word";
    expect(await grammarFieldsDrafts(word.a, word.run.id)).toEqual([]);
  });

  it("lists the proposed links before the Study Item, which is last", async () => {
    const w = await world();
    const [draft] = await grammarFieldsDrafts(w.a, w.run.id);
    expect(draft!.records).toEqual([{ table: "sentenceDemonstratesGrammar", id: w.link }, { table: "studyItem", id: w.item }]);
  });
});

describe("what the reviewer is told when a field is empty", () => {
  it("says none for missing notes, links, forms and translation, and Unlevelled for no level", async () => {
    const w = await world({ forms: [], formation: [], notes: "Said when regretting." });
    w.graph.levelCandidate.length = 0;
    w.graph.sentence[0]!.translationEn = null;
    const [draft] = await grammarFieldsDrafts(w.a, w.run.id);
    const values = grammarFieldsValues(draft!, { failures: [], level: null });
    expect(values).toMatchObject({ level: "Unlevelled", forms: "none", formation: "none", notes: "Said when regretting." });
    expect(values.links).toBe("- 食べてしまった。 (none) 「食べてしまっ」");
    w.graph.sentenceDemonstratesGrammar.length = 0;
    const [bare] = await grammarFieldsDrafts(w.a, w.run.id);
    expect(grammarFieldsValues({ ...bare!, point: { ...bare!.point, notes: null } }, { failures: [], level: "N4" })).toMatchObject({ links: "none", notes: "none", level: "N4" });
  });
});
