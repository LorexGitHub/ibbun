import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import { createFakeLlm, loadLlmConfig } from "@ibbun/llm";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";

const clock = () => {
  let t = Date.parse("2026-11-06T09:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

const good = {
  alternates: [{ written: "食べます", reading: "たべます", nudge: "That works, but we want the plain form." }],
  knownWrong: [{ written: "食べた", reading: "たべた", explanation: "That is the past tense; the sentence is in the present." }],
  hint: "to eat",
};

type Options = { answer?: (prompt: string) => unknown; approval?: "draft" | "approved"; hint?: string | null };

const setup = ({ answer = (): unknown => good, approval = "draft", hint = null }: Options = {}) => {
  const w = world();
  const c = clock();
  const auth = createFakeAuthoring(w.graph, c);
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer: ({ prompt }) => answer(prompt) });
  const generation = contentGeneration({ auth, llm, jobs, progress: createFakeProgress(), texts: createFakeTexts(), config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 }, now: c.now });
  const sentenceId = randomUUID();
  const exampleId = randomUUID();
  const tatoeba = randomUUID();
  const life = { approval: "draft" as const, retired: false, provenanceId: tatoeba };
  w.graph.provenance.push({ id: tatoeba, source: { kind: "authored", by: "tatoeba" }, licence: "cc-by-2.0-fr", author: "someone", sourceUrl: null, inputs: [] });
  w.graph.sentence.push({ id: sentenceId, text: "毎日ご飯を食べる。", translationEn: "I eat rice every day.", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
  w.graph.example.push({ id: exampleId, sentenceId, studyItemId: w.wordId, spanStart: 5, spanEnd: 8, targetSenseId: null, hint, comprehensionQuestion: null, ...life, approval });
  w.graph.exampleAnswer.push({ id: randomUUID(), exampleId, kind: "accepted", written: "食べる", reading: "たべる", message: null, ...life });
  const ready = jobs.work(generation.handlers);
  const run = async (targetId = exampleId, feedback?: string) => {
    await ready;
    const r = await auth.requestGeneration({ targetId, kind: "answer_data", reason: "missing" });
    await jobs.enqueue(ContentGenerate, { requestId: r.id, feedback });
    await jobs.drain();
    return r;
  };
  const generated = async () => (await auth.rows("exampleAnswer", { exampleId })).filter((a) => a.kind !== "accepted");
  return { ...w, auth, llm, run, exampleId, generated };
};

describe("content.generate for answer data", () => {
  it("writes Draft alternates, known wrong answers and a hint for an existing Example, with generated Provenance", async () => {
    const t = setup();
    const r = await t.run();

    const [genRun] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(genRun).toMatchObject({ promptTemplateVersion: "answer-data/1" });
    const answers = await t.generated();
    expect(answers).toMatchObject([
      { kind: "alternate", written: "食べます", reading: "たべます", message: "That works, but we want the plain form.", approval: "draft" },
      { kind: "known_wrong", written: "食べた", reading: "たべた", message: "That is the past tense; the sentence is in the present.", approval: "draft" },
    ]);
    const [provenance] = await t.auth.rows("provenance", { id: answers[0]!.provenanceId });
    expect(provenance).toMatchObject({ source: { kind: "generated", generationRunId: genRun!.id }, licence: "ibbun" });
    expect(provenance!.inputs).toContain(t.exampleId);
    expect(provenance!.inputs).toContain(t.wordId);
    expect((await t.auth.rows("example", { id: t.exampleId }))[0]).toMatchObject({ hint: "to eat", approval: "draft" });
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]!.status).toBe("in review");
  });

  it("shows the model the sentence, its translation, the target and the accepted answers", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), good) });
    await t.run();
    expect(prompts[0]).toContain("Sentence: 毎日ご飯を食べる。");
    expect(prompts[0]).toContain("Translation: I eat rice every day.");
    expect(prompts[0]).toContain("Target: 食べる");
    expect(prompts[0]).toContain("Accepted: 食べる (たべる)");
    expect(prompts[0]).toContain("N5");
  });

  it("keeps a hint the Example already has", async () => {
    const t = setup({ hint: "eat (plain form)" });
    await t.run();
    expect((await t.auth.rows("example", { id: t.exampleId }))[0]!.hint).toBe("eat (plain form)");
  });

  it("leaves the hint empty when the model gives none", async () => {
    const t = setup({ answer: () => ({ ...good, hint: null }) });
    await t.run();
    expect((await t.auth.rows("example", { id: t.exampleId }))[0]!.hint).toBeNull();
  });

  it("passes the last rejection to the next attempt", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), good) });
    await t.run(t.exampleId, "the nudge gives the answer away");
    expect(prompts[0]).toContain("the nudge gives the answer away");
  });

  it("retries an alternate or known wrong answer that is an accepted answer, then fails the request", async () => {
    const accepted = { written: "食べる", reading: null };
    for (const bad of [{ ...good, alternates: [{ ...accepted, nudge: "n" }] }, { ...good, knownWrong: [{ ...accepted, explanation: "e" }] }]) {
      const t = setup({ answer: () => bad });
      const r = await t.run();
      expect(t.llm.calls()).toHaveLength(3);
      expect(await t.generated()).toEqual([]);
      expect((await t.auth.rows("generationRequest", { id: r.id }))[0]!.status).toBe("failed");
    }
  });

  it("will not touch an Example that is already approved", async () => {
    const t = setup({ approval: "approved" });
    await t.run();
    expect(t.llm.calls()).toHaveLength(0);
    expect(await t.generated()).toEqual([]);
  });

  it("uses an attempt for an Example that is gone", async () => {
    const t = setup();
    await t.run(randomUUID());
    expect(t.llm.calls()).toHaveLength(0);
  });
});
