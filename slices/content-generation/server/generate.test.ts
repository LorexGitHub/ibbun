import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, type Graph } from "@ibbun/content-graph/testing";
import { ContentGenerate, ContentReview } from "@ibbun/content-graph/jobs";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import { createFakeLlm, loadLlmConfig } from "@ibbun/llm";
import { contentGeneration } from "./generate.ts";
import { world } from "./world.ts";

const clock = () => {
  let t = Date.parse("2026-11-06T09:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

const sentence = (text: string, target: string) => ({ text, translationEn: "I eat.", target, targetReading: "たべる", hint: null });
const good = { sentences: [sentence("毎日ご飯を食べる。", "食べる"), sentence("パンを食べる。", "食べる")] };

const setup = ({ answer = (): unknown => good, dailyTokenBudget = 1_000_000 }: { answer?: (prompt: string) => unknown; dailyTokenBudget?: number } = {}) => {
  const w = world();
  const c = clock();
  const auth = createFakeAuthoring(w.graph, c);
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer: ({ prompt }) => answer(prompt) });
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const generation = contentGeneration({ auth, llm, jobs, progress, texts, config: { dailyTokenBudget, batchTextShare: 0.5 }, now: c.now });
  const ready = jobs.work(generation.handlers);
  const request = (targetId: string, kind = "examples") => auth.requestGeneration({ targetId, kind, reason: "suspended" });
  const run = async (targetId: string, feedback?: string) => {
    await ready;
    const r = await request(targetId);
    await jobs.enqueue(ContentGenerate, { requestId: r.id, feedback });
    await jobs.drain();
    return r;
  };
  return { ...w, auth, jobs, llm, progress, texts, generation, request, run, ready };
};

describe("content.generate for Example Sentences", () => {
  it("writes Drafts with generated Provenance, records the Generation Run and hands the draft to review", async () => {
    const t = setup();
    const r = await t.run(t.wordId);

    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(run).toMatchObject({ model: "claude-sonnet-5-5", promptTemplateVersion: "example-sentence/1" });
    expect(run!.tokens).toBeGreaterThan(0);
    expect(run!.cost).toBeGreaterThan(0);
    expect(JSON.stringify(run!.inputs)).toContain("to eat");

    const examples = (await t.auth.rows("example", { studyItemId: t.wordId })).filter((e) => e.approval === "draft");
    expect(examples).toHaveLength(2);
    const sentences = await t.auth.rows("sentence", { approval: "draft" });
    expect(sentences.map((s) => s.text).sort()).toEqual(["パンを食べる。", "毎日ご飯を食べる。"]);
    const [first] = sentences;
    const [provenance] = await t.auth.rows("provenance", { id: first!.provenanceId });
    expect(provenance).toMatchObject({
      source: { kind: "generated", model: "claude-sonnet-5-5", promptTemplateVersion: "example-sentence/1", generationRunId: run!.id },
      licence: "ibbun",
    });
    expect(provenance!.inputs).toContain(t.wordId);
    expect(provenance!.inputs).toContain(t.senseId);

    const example = examples.find((e) => e.sentenceId === first!.id)!;
    expect(first!.text.slice(example.spanStart, example.spanEnd)).toBe("食べる");
    const answers = await t.auth.rows("exampleAnswer", { exampleId: example.id });
    expect(answers).toMatchObject([{ kind: "accepted", written: "食べる", reading: "たべる", approval: "draft" }]);

    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]!.status).toBe("in review");
    expect(t.jobs.pending()).toEqual(["content.review"]);
  });

  it("enqueues content.review with the request and run", async () => {
    const t = setup();
    const seen: unknown[] = [];
    await t.jobs.work([...t.generation.handlers, { contract: ContentReview, handle: async (p) => void seen.push(p) }]);
    const r = await t.run(t.wordId);
    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(seen).toEqual([{ requestId: r.id, runId: run!.id }]);
  });

  it("puts the Kanji and its readings in the prompt for a levelled Kanji, capped at its level", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), { sentences: [sentence("食べる。", "食")] }) });
    await t.run(t.kanjiId);
    expect(prompts[0]).toContain("食");
    expect(prompts[0]).toContain("ショク");
    expect(prompts[0]).toContain("N4");
  });

  it("tops a Grammar Point up to five approved Examples", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), { sentences: [sentence("食べます。", "ます")] }) });
    const sentenceId = randomUUID();
    const example = (id: string): Graph["example"][number] => ({
      id, sentenceId, studyItemId: t.grammarId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...t.life,
    });
    await t.auth.insert("example", [example(randomUUID()), example(randomUUID())]);
    await t.run(t.grammarId);
    expect(prompts[0]).toContain("Write 3 Example Sentences");
  });

  it("puts a Grammar Point's notes in the prompt", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), { sentences: [sentence("食べます。", "ます")] }) });
    await t.auth.update("grammarPoint", { studyItemId: t.grammarId }, { notes: "Attaches to the verb stem." });
    await t.run(t.grammarId);
    expect(prompts[0]).toContain("Notes: Attaches to the verb stem.");
  });

  it("uses an attempt when a Word has no forms or readings", async () => {
    const t = setup();
    const bare = randomUUID();
    await t.auth.insert("studyItem", [{ id: bare, type: "word", ...t.life }]);
    await t.run(bare);
    expect(t.llm.calls()).toHaveLength(0);
  });

  it("passes the last rejection to the next attempt", async () => {
    const prompts: string[] = [];
    const t = setup({ answer: (p) => (prompts.push(p), good) });
    await t.run(t.wordId, "the second sentence is unnatural");
    expect(prompts[0]).toContain("the second sentence is unnatural");
  });

  it("retries a draft outside the requested shape, then fails the request after 3 attempts", async () => {
    const t = setup({ answer: () => ({ sentences: [sentence("パンを食べる。", "飲む")] }) });
    const r = await t.run(t.wordId);

    expect(t.llm.calls()).toHaveLength(3);
    expect(await t.auth.rows("generationRun", { requestId: r.id })).toHaveLength(3);
    expect(await t.auth.rows("sentence", { approval: "draft" })).toHaveLength(0);
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed", attempts: 3 });
    expect(await t.auth.queue({ reason: "generation failed" })).toMatchObject([{ generationRequestId: r.id }]);
  });

  it("does nothing for a request that is no longer open", async () => {
    const t = setup();
    const r = await t.run(t.wordId);
    await t.jobs.enqueue(ContentGenerate, { requestId: r.id });
    await t.jobs.drain();
    expect(t.llm.calls()).toHaveLength(1);
  });

  it("uses an attempt when the target is gone", async () => {
    const t = setup();
    const r = await t.run(randomUUID());
    expect(t.llm.calls()).toHaveLength(0);
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("fails a request whose kind has no generator", async () => {
    const t = setup();
    await t.ready;
    const r = await t.request(t.wordId, "no-such-kind");
    await t.jobs.enqueue(ContentGenerate, { requestId: r.id });
    await t.jobs.drain();
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed" });
  });
});

describe("the daily token budget", () => {
  it("pauses general work once its pool is spent and alerts once", async () => {
    const t = setup({ dailyTokenBudget: 100 });
    const first = await t.run(t.wordId);
    expect(t.llm.calls()).toHaveLength(1);

    const second = await t.request(t.kanjiId);
    await t.jobs.enqueue(ContentGenerate, { requestId: second.id });
    await t.jobs.enqueue(ContentGenerate, { requestId: second.id });
    await t.jobs.drain();

    expect(t.llm.calls()).toHaveLength(1);
    expect((await t.auth.rows("generationRequest", { id: second.id }))[0]).toMatchObject({ status: "open", attempts: 0 });
    expect(await t.auth.queue({ reason: "budget exhausted" })).toMatchObject([{ detail: { pool: "general" } }]);
    expect(first.id).not.toBe(second.id);
  });

  it("caps Batch Texts at 50% without touching the rest of the budget", async () => {
    const t = setup({ dailyTokenBudget: 100_000 });
    const batch = await t.request(t.wordId, "batch-text");
    await t.auth.recordGenerationRun({ requestId: batch.id, model: "m", promptTemplateVersion: "v", inputs: [], tokens: 50_000, cost: 1 });
    await t.run(t.wordId);
    expect(t.llm.calls()).toHaveLength(1);
    expect(await t.auth.queue({ reason: "budget exhausted" })).toEqual([]);
  });

  it("pauses the Learner-triggered pool when it is spent, naming it", async () => {
    const t = setup({ dailyTokenBudget: 100_000 });
    const batch = await t.request(t.wordId, "batch-text");
    await t.auth.recordGenerationRun({ requestId: batch.id, model: "m", promptTemplateVersion: "v", inputs: [], tokens: 50_000, cost: 1 });
    await t.ready;
    await t.jobs.enqueue(ContentGenerate, { requestId: batch.id });
    await t.jobs.drain();
    expect(await t.auth.queue({ reason: "budget exhausted" })).toMatchObject([{ detail: { pool: "learner" } }]);
  });

  it("resumes paused requests when their pool has budget again", async () => {
    const t = setup({ dailyTokenBudget: 100 });
    await t.run(t.wordId);
    const paused = await t.request(t.kanjiId);
    await t.jobs.enqueue(ContentGenerate, { requestId: paused.id });
    await t.jobs.drain();
    expect(await t.generation.resumePaused()).toBe(0);

    const raised = contentGeneration({ auth: t.auth, llm: t.llm, jobs: t.jobs, progress: t.progress, texts: t.texts, config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 } });
    await t.jobs.work(raised.handlers);
    expect(await raised.resumePaused()).toBe(1);
    await t.jobs.drain();
    expect((await t.auth.rows("generationRequest", { id: paused.id }))[0]!.status).toBe("in review");
  });
});
