import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { ContentGenerate, ContentReview } from "@ibbun/content-graph/jobs";
import { createFakeJobs, handler } from "@ibbun/jobs";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@ibbun/llm";
import { createFakeNlp, type Token } from "@ibbun/nlp";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import type { NewPracticeText } from "@ibbun/progress";
import { LearnerId } from "@ibbun/shared";
import { DEFAULT_CONFIG } from "../../src/config.ts";
import { rubricFor } from "../../src/rubrics.ts";
import { reviewRun } from "../../src/review-job.ts";
import { DEFAULT_SAMPLING } from "../../sampling/config.ts";
import { createSampling } from "../../sampling/sampler.ts";
import { createMemoryStore } from "../../sampling/store.ts";

const learnerId = LearnerId.parse(randomUUID());
const tok = (surface: string): Token => ({ surface, lemma: surface, reading: surface, partOfSpeech: ["名詞", "普通名詞", "一般"], conjugation: null });
const nlp = createFakeNlp(["水", "みず", "を", "飲む", "酒", "。"].map(tok));

type Line = { text: string; translationEn: string; speaker?: "男" | "女" };
const WATER: Line[] = [{ text: "水を飲む。", translationEn: "I drink water." }];

/** A Learner, the Words 水 and 飲む at N5 and 酒 at N1, and one drafted passage of `lines` for a request of `kind`. */
const world = async (kind: "batch-text" | "practice-text", lines: Line[] = WATER, passage: { form?: "prose" | "dialogue"; questions?: { question: string; choices: string[]; answer: number }[] } = {}) => {
  const graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const texts = createFakeTexts();
  const authored = randomUUID();
  graph.provenance.push({ id: authored, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const approved = { approval: "approved" as const, retired: false, provenanceId: authored };
  const word = (form: string, level: "N5" | "N1") => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "word", ...approved });
    graph.word.push({ studyItemId: id, priorityTags: [], usuallyKana: false });
    graph.wordForm.push({ id: randomUUID(), wordId: id, position: 0, text: form, ...approved });
    graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...approved });
    return id;
  };
  const water = word("水", "N5");
  word("飲む", "N5");
  word("酒", "N1");

  const passageId = randomUUID();
  const at = "2026-11-15T09:00:00.000Z";
  let reason: string;
  if (kind === "batch-text") {
    await texts.record({ kind: "batch", learnerId, passageId: randomUUID(), at, level: "N5", episode: 1, studyItemIds: [water], episodeSummary: "ゆきが店に行った。", cast: ["ゆき"] });
    await texts.record({ kind: "batch", learnerId, passageId, at, level: "N5", episode: 2, studyItemIds: [water], episodeSummary: "ゆきが水を飲んだ。", cast: ["ゆき"], passageType: "memo" });
    reason = `batch-text ${JSON.stringify({ learnerId, level: "N5", itemIds: [water] })}`;
  } else {
    const record: NewPracticeText = { kind: "practice", learnerId, passageId, at, level: "N5", form: passage.form === "dialogue" ? "dialogue" : "passage", passageType: "any", length: "short", topic: "food" };
    const recorded = await texts.record(record);
    reason = `practice-text ${JSON.stringify({ learnerId, practiceTextId: recorded.id })}`;
  }
  const request = await a.requestGeneration({ targetId: passageId, kind, reason });
  const run = await a.recordGenerationRun({ requestId: request.id, model: "gemma4:12b", promptTemplateVersion: "t/1", inputs: [], tokens: 10, cost: 0 });
  const generated = randomUUID();
  graph.provenance.push({ id: generated, source: { kind: "generated", model: "gemma4:12b", promptTemplateVersion: "t/1", generationRunId: run.id }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const draft = { approval: "draft" as const, retired: false, provenanceId: generated };
  graph.readingPassage.push({ id: passageId, title: "水", form: passage.form ?? "prose", comprehensionQuestions: passage.questions ?? [], ...draft });
  const sentences = lines.map((line, position) => {
    const id = randomUUID();
    graph.sentence.push({ id, text: line.text, translationEn: line.translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...draft });
    graph.passageContainsSentence.push({ id: randomUUID(), passageId, sentenceId: id, position, speaker: line.speaker ?? null, ...draft });
    return id;
  });
  return { graph, a, texts, passageId, sentences, request, run };
};
type World = Awaited<ReturnType<typeof world>>;

const verdicts = (criteria: string[], failing: string[] = []) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: criteria.map((criterion) => ({ criterion, pass: !failing.includes(criterion), note: failing.includes(criterion) ? `${criterion} is off` : "ok" })),
    confidence: 0.95,
    bothReadingsAcceptable: false,
  };
};
const BATCH = rubricFor("reading-passage").criteria;
const PRACTICE = rubricFor("practice-text").criteria;

const review = async (w: World, answer: (call: FakeLlmCall) => unknown) => {
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer });
  const progress = createFakeProgress();
  const sampling = createSampling({ store: createMemoryStore(), authoring: w.a, progress, jobs, config: DEFAULT_SAMPLING });
  const deps = { authoring: w.a, nlp, llm, jobs, config: DEFAULT_CONFIG, sampling, progress, texts: w.texts };
  const generated: unknown[] = [];
  await jobs.work([handler(ContentGenerate, async (p) => void generated.push(p)), handler(ContentReview, (p) => reviewRun(deps, p))]);
  await jobs.enqueue(ContentReview, { requestId: w.request.id, runId: w.run.id });
  await jobs.drain();
  return { llm, generated };
};

const approvals = (w: World) => ({
  passage: w.graph.readingPassage[0]!.approval,
  sentences: w.graph.sentence.filter((s) => (w.sentences as string[]).includes(s.id)).map((s) => s.approval),
  links: w.graph.passageContainsSentence.map((l) => l.approval),
});

describe("reviewing a Batch Text", () => {
  it("shows the reviewer the level, passage type, episode, the last episode's summary, the batch items and every Sentence", async () => {
    const { llm } = await review(await world("batch-text"), verdicts(BATCH));
    const prompt = llm.calls()[0]!.prompt;
    expect(prompt).toContain("JLPT Level of the batch: N5");
    expect(prompt).toContain("Passage type asked for: memo");
    expect(prompt).toContain("Episode: 2");
    expect(prompt).toContain("Cast: ゆき\nゆきが店に行った。");
    expect(prompt).toContain("- Word 水");
    expect(prompt).toContain("水を飲む。 (I drink water.)");
  });

  it("approves the passage, its Sentences and their links as one unit, stores the tokens and finishes the request", async () => {
    const w = await world("batch-text");
    await review(w, verdicts(BATCH));
    expect(approvals(w)).toEqual({ passage: "approved", sentences: ["approved"], links: ["approved"] });
    expect(w.graph.sentence.find((s) => s.id === w.sentences[0])!.tokens.map((t) => t.surface)).toEqual(["水", "を", "飲む", "。"]);
    expect(w.graph.generationRequest.find((r) => r.id === w.request.id)!.status).toBe("done");
    expect((await w.a.decisions(w.passageId))[0]).toMatchObject({ outcome: "approved", decider: { kind: "reviewer", rubricVersion: "reading-passage/v2" } });
  });

  it("rejects the unit when the reviewer fails a criterion", async () => {
    const w = await world("batch-text");
    const { generated } = await review(w, verdicts(BATCH, ["consistency"]));
    expect(approvals(w)).toEqual({ passage: "rejected", sentences: ["rejected"], links: ["rejected"] });
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "consistency: consistency is off" }]);
  });

  it("rejects a passage that leaves out a batch item, or uses a Word above the level the Learner doesn't Know, without the reviewer", async () => {
    const w = await world("batch-text", [{ text: "酒を飲む。", translationEn: "I drink sake." }]);
    const { llm, generated } = await review(w, verdicts(BATCH));
    expect(llm.calls()).toHaveLength(0);
    expect(approvals(w).passage).toBe("rejected");
    expect(generated).toEqual([
      { requestId: w.request.id, feedback: "batch-item: The batch word 「水」 does not appear. Use it.\nout-of-reach: 「酒」 is N1 and not Known to the Learner. Replace it." },
    ]);
  });

  it("reads a spelling shared by several JMdict Words as the easiest levelled one", async () => {
    const w = await world("batch-text");
    const other = randomUUID();
    w.graph.studyItem.push({ id: other, type: "word", approval: "approved", retired: false, provenanceId: w.graph.provenance[0]!.id });
    w.graph.wordForm.unshift({ id: randomUUID(), wordId: other, position: 0, text: "飲む", approval: "approved", retired: false, provenanceId: w.graph.provenance[0]!.id });
    await review(w, verdicts(BATCH));
    expect(approvals(w).passage).toBe("approved");
  });

  it("counts a batch Word written in kana", async () => {
    const w = await world("batch-text", [{ text: "みずを飲む。", translationEn: "I drink water." }]);
    const water = w.graph.wordForm.find((f) => f.text === "水")!;
    w.graph.wordReading.push({ id: randomUUID(), wordId: water.wordId, position: 0, text: "みず", pitchAccent: null, approval: "approved", retired: false, provenanceId: water.provenanceId });
    await review(w, verdicts(BATCH));
    expect(approvals(w).passage).toBe("approved");
  });

  it("does nothing again once the passage is decided", async () => {
    const w = await world("batch-text");
    await review(w, verdicts(BATCH));
    const { llm } = await review(w, verdicts(BATCH));
    expect(llm.calls()).toHaveLength(0);
  });
});

describe("reviewing a Practice Text", () => {
  const QUESTIONS = [
    { question: "なにを飲みますか。", choices: ["水", "酒", "茶", "牛乳"], answer: 0 },
    { question: "だれが飲みますか。", choices: ["男", "女", "子ども", "先生"], answer: 1 },
  ];
  const DIALOGUE: Line[] = [{ ...WATER[0]!, speaker: "男" }, { text: "水を飲む。", translationEn: "Me too.", speaker: "女" }];

  it("shows the reviewer the Learner's choices, every line with its speaker and both questions", async () => {
    const { llm } = await review(await world("practice-text", DIALOGUE, { form: "dialogue", questions: QUESTIONS }), verdicts(PRACTICE));
    const prompt = llm.calls()[0]!.prompt;
    expect(prompt).toContain("Kind: dialogue");
    expect(prompt).toContain("Topic chosen: food");
    expect(prompt).toContain("男: 水を飲む。 (I drink water.)\n女: 水を飲む。 (Me too.)");
    expect(prompt).toContain("2. だれが飲みますか。\n   correct: 女\n   wrong: 男 / 子ども / 先生");
  });

  it("approves a passage, and says it has no questions", async () => {
    const w = await world("practice-text");
    const { llm } = await review(w, verdicts(PRACTICE));
    expect(llm.calls()[0]!.prompt).toContain("none: this is a passage");
    expect(approvals(w)).toEqual({ passage: "approved", sentences: ["approved"], links: ["approved"] });
  });

  it("rejects a dialogue whose question repeats a choice, without the reviewer", async () => {
    const w = await world("practice-text", DIALOGUE, { form: "dialogue", questions: [QUESTIONS[0]!, { ...QUESTIONS[1]!, choices: ["男", "男", "女", "先生"] }] });
    const { llm, generated } = await review(w, verdicts(PRACTICE));
    expect(llm.calls()).toHaveLength(0);
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "questions: Question 2 needs four different choices." }]);
  });
});
