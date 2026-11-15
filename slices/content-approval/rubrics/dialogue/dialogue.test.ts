import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { ContentGenerate, ContentReview } from "@ibbun/content-graph/jobs";
import { createFakeJobs, handler } from "@ibbun/jobs";
import { createFakeLlm, loadLlmConfig, type FakeLlmCall } from "@ibbun/llm";
import { createFakeNlp, type Token } from "@ibbun/nlp";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import { DEFAULT_CONFIG } from "../../src/config.ts";
import { reviewRun } from "../../src/review-job.ts";
import { DEFAULT_SAMPLING } from "../../sampling/config.ts";
import { createSampling } from "../../sampling/sampler.ts";
import { createMemoryStore } from "../../sampling/store.ts";
import { dialogueDrafts } from "./index.ts";

const CRITERIA = ["spoken-register", "speaker-turns", "audio-only", "questions", "target-grammar", "length"];

const tok = (surface: string): Token => ({ surface, lemma: surface, reading: surface, partOfSpeech: ["名詞"], conjugation: null });
const LINES = [
  { speaker: "男" as const, text: "いきますか。", translationEn: "Are you going?" },
  { speaker: "女" as const, text: "はい。", translationEn: "Yes." },
];
const nlp = createFakeNlp(["いきます", "か", "。", "はい"].map(tok));

type Options = { lines?: typeof LINES; choices?: string[] };

/** A drafted dialogue clip for an N5 Grammar Point 〜ますか: two lines, two questions, written by one Generation Run. */
const world = async ({ lines = LINES, choices = ["はい", "いいえ", "たぶん", "わからない"] }: Options = {}) => {
  const graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const authored = randomUUID();
  graph.provenance.push({ id: authored, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const point = randomUUID();
  graph.studyItem.push({ id: point, type: "grammar_point", approval: "approved", retired: false, provenanceId: authored });
  graph.grammarPoint.push({ studyItemId: point, title: "〜ますか", forms: [], formation: [], register: "polite", meaning: "polite question", notes: null, matcherRule: null });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: point, level: "N5", kind: "list", approval: "approved", retired: false, provenanceId: authored });

  const request = await a.requestGeneration({ targetId: point, kind: "dialogue", reason: "test" });
  const run = await a.recordGenerationRun({ requestId: request.id, model: "gemma4:12b", promptTemplateVersion: "dialogue/1", inputs: [point], tokens: 100, cost: 0 });
  const generated = randomUUID();
  graph.provenance.push({ id: generated, source: { kind: "generated", model: "gemma4:12b", promptTemplateVersion: "dialogue/1", generationRunId: run.id }, licence: "ibbun", author: null, sourceUrl: null, inputs: [point] });
  const life = { approval: "draft" as const, retired: false, provenanceId: generated };
  const clip = request.id;
  graph.studyItem.push({ id: clip, type: "listening_clip", ...life });
  graph.listeningClip.push({ studyItemId: clip, kind: "dialogue" });
  const sentences = lines.map((line, position) => {
    const id = randomUUID();
    graph.sentence.push({ id, text: line.text, translationEn: line.translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
    graph.clipVoicesSentence.push({ id: randomUUID(), clipId: clip, sentenceId: id, position, speaker: line.speaker, voice: "2", audioKey: null, ...life });
    return id;
  });
  const questions = ["男の人はどこにいきますか。", "女の人はなんといいましたか。"].map((question) => {
    const id = randomUUID();
    graph.example.push({
      id, studyItemId: clip, sentenceId: sentences[0]!, spanStart: 0, spanEnd: lines[0]!.text.length, targetSenseId: null, hint: null,
      comprehensionQuestion: { question, choices, answer: 0 }, ...life,
    });
    return id;
  });
  return { graph, a, clip, sentences, questions, request, run };
};
type World = Awaited<ReturnType<typeof world>>;

const verdicts = (failing: string[] = []) => (call: FakeLlmCall) => {
  void call;
  return {
    verdicts: CRITERIA.map((criterion) => ({ criterion, pass: !failing.includes(criterion), note: failing.includes(criterion) ? `${criterion} is off` : "ok" })),
    confidence: 0.95,
    bothReadingsAcceptable: false,
  };
};

const review = async (w: World, answer = verdicts()) => {
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer });
  const sampling = createSampling({ store: createMemoryStore(), authoring: w.a, progress: createFakeProgress(), jobs, config: DEFAULT_SAMPLING });
  const deps = { authoring: w.a, nlp, llm, jobs, config: DEFAULT_CONFIG, sampling, progress: createFakeProgress(), texts: createFakeTexts() };
  const generated: unknown[] = [];
  await jobs.work([handler(ContentGenerate, async (p) => void generated.push(p)), handler(ContentReview, (p) => reviewRun(deps, p))]);
  await jobs.enqueue(ContentReview, { requestId: w.request.id, runId: w.run.id });
  await jobs.drain();
  return { llm, generated };
};

const approvals = (w: World) => ({
  clip: w.graph.studyItem.find((i) => i.id === w.clip)!.approval,
  sentences: w.sentences.map((id) => w.graph.sentence.find((s) => s.id === id)!.approval),
  questions: w.questions.map((id) => w.graph.example.find((e) => e.id === id)!.approval),
  lines: w.graph.clipVoicesSentence.map((l) => l.approval),
});

describe("reviewing a dialogue", () => {
  it("shows the reviewer the level, the Grammar Point, every line with its speaker and each question with its correct option", async () => {
    const { llm } = await review(await world());
    const prompt = llm.calls()[0]!.prompt;
    expect(prompt).toContain("JLPT Level of the target: N5");
    expect(prompt).toContain("Target Grammar Point: 〜ますか");
    expect(prompt).toContain("Number of lines: 2");
    expect(prompt).toContain("男: いきますか。 (Are you going?)\n女: はい。 (Yes.)");
    expect(prompt).toContain("1. 男の人はどこにいきますか。\n   correct: はい\n   wrong: いいえ / たぶん / わからない");
  });

  it("approves the clip, its Sentences and both questions as one unit, stores the tokens and finishes the request", async () => {
    const w = await world();
    await review(w);
    expect(approvals(w)).toEqual({ clip: "approved", sentences: ["approved", "approved"], questions: ["approved", "approved"], lines: ["draft", "draft"] });
    expect(w.graph.sentence.find((s) => s.id === w.sentences[0])!.tokens.map((t) => t.surface)).toEqual(["いきます", "か", "。"]);
    expect(w.graph.generationRequest.find((r) => r.id === w.request.id)!.status).toBe("done");
    expect((await w.a.decisions(w.clip))[0]).toMatchObject({ outcome: "approved", decider: { kind: "reviewer", rubricVersion: "dialogue/v2" } });
  });

  it("rejects the whole unit when the reviewer fails a criterion, and sends the reason back to the generator", async () => {
    const w = await world();
    const { generated } = await review(w, verdicts(["audio-only"]));
    expect(approvals(w)).toMatchObject({ clip: "rejected", sentences: ["rejected", "rejected"], questions: ["rejected", "rejected"] });
    expect(generated).toEqual([{ requestId: w.request.id, feedback: "audio-only: audio-only is off" }]);
  });

  it("rejects a dialogue with one speaker, or a question without four different choices, without calling the reviewer", async () => {
    const w = await world({ lines: LINES.map((l) => ({ ...l, speaker: "男" as const })), choices: ["はい", "はい", "いいえ"] });
    const { llm, generated } = await review(w);
    expect(llm.calls()).toHaveLength(0);
    expect(approvals(w).clip).toBe("rejected");
    expect(generated).toEqual([
      {
        requestId: w.request.id,
        feedback: "speaker-turns: Both 男 and 女 must speak.\nquestions: Question 1 needs four different choices.\nquestions: Question 2 needs four different choices.",
      },
    ]);
  });
});

describe("dialogueDrafts", () => {
  it("finds nothing once the clip is decided", async () => {
    const w = await world();
    w.graph.studyItem.find((i) => i.id === w.clip)!.approval = "approved";
    expect(await dialogueDrafts(w.a, w.run.id)).toEqual([]);
  });

  it("leaves out the lines and questions of an earlier, retired attempt, and puts the clip last", async () => {
    const w = await world();
    for (const l of w.graph.clipVoicesSentence) if (l.sentenceId === w.sentences[1]) l.retired = true;
    w.graph.example.find((e) => e.id === w.questions[1])!.retired = true;
    const [draft] = await dialogueDrafts(w.a, w.run.id);
    expect(draft!.records).toEqual([{ table: "sentence", id: w.sentences[0] }, { table: "example", id: w.questions[0] }, { table: "studyItem", id: w.clip }]);
  });
});
