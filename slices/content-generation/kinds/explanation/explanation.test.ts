import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@mojibun/content-graph/testing";
import { ContentGenerate } from "@mojibun/content-graph/jobs";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeLlm, loadLlmConfig } from "@mojibun/llm";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";

const clock = () => {
  let t = Date.parse("2026-11-07T09:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

const setup = (answer: (prompt: string) => unknown = () => ({ text: "ものをくちにいれて、のみこむこと。" })) => {
  const w = world();
  const c = clock();
  const auth = createFakeAuthoring(w.graph, c);
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer: ({ prompt }) => answer(prompt) });
  const ready = jobs.work(contentGeneration({ auth, llm, jobs, config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 }, now: c.now }).handlers);
  const run = async (targetId: string, feedback?: string) => {
    await ready;
    const request = await auth.requestGeneration({ targetId, kind: "explanation", reason: "missing" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id, feedback });
    await jobs.drain();
    return request;
  };
  /** A ja Wiktionary explanation of the target, as the seed leaves it. */
  const wiktionary = async (target: { wordSenseId: string } | { grammarPointId: string }, approval: "approved" | "draft" | "rejected" = "approved") => {
    const importRunId = randomUUID();
    const provenanceId = randomUUID();
    const id = randomUUID();
    await auth.insert("importRun", [{ id: importRunId, dataset: "wiktionary-ja", upstreamVersion: "1", checksum: "x", status: "applied", counts: {}, appliedAt: null }]);
    await auth.insert("provenance", [{ id: provenanceId, source: { kind: "import", importRunId }, licence: "cc-by-sa-4.0", author: null, sourceUrl: null, inputs: [] }]);
    await auth.insert("japaneseExplanation", [
      { id, wordSenseId: null, grammarPointId: null, ...target, text: "ウィクショナリーの説明。", approval, retired: false, provenanceId },
    ]);
    return id;
  };
  return { ...w, auth, jobs, llm, run, wiktionary };
};

describe("content.generate for Japanese Explanations", () => {
  it("drafts an explanation of a Word sense Wiktionary doesn't cover, with generated Provenance", async () => {
    const t = setup();
    const r = await t.run(t.senseId);

    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(run).toMatchObject({ promptTemplateVersion: "explanation/1" });
    const [draft] = await t.auth.rows("japaneseExplanation", { wordSenseId: t.senseId });
    expect(draft).toMatchObject({ text: "ものをくちにいれて、のみこむこと。", grammarPointId: null, approval: "draft", retired: false });
    const [provenance] = await t.auth.rows("provenance", { id: draft!.provenanceId });
    expect(provenance).toMatchObject({ source: { kind: "generated", generationRunId: run!.id }, licence: "mojibun" });
    expect(provenance!.inputs).toContain(t.senseId);
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]!.status).toBe("in review");
    expect(t.jobs.pending()).toEqual(["content.review"]);
  });

  it("describes the sense, its headword and its level in the prompt", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "せつめい。" }));
    await t.run(t.senseId);
    expect(prompts[0]).toContain("Word sense");
    expect(prompts[0]).toContain("食べる");
    expect(prompts[0]).toContain("to eat");
    expect(prompts[0]).toContain("N5");
  });

  it("leaves the other senses of the Word out of the prompt and the inputs", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "せつめい。" }));
    const other = randomUUID();
    const [word] = await t.auth.rows("wordSense", { id: t.senseId });
    await t.auth.insert("wordSense", [{ ...word!, id: other, position: 1, glosses: ["to live on"] }]);
    const r = await t.run(t.senseId);
    expect(prompts[0]).not.toContain("to live on");
    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(JSON.stringify(run!.inputs)).not.toContain("to live on");
    const [draft] = await t.auth.rows("japaneseExplanation", { wordSenseId: t.senseId });
    expect((await t.auth.rows("provenance", { id: draft!.provenanceId }))[0]!.inputs).not.toContain(other);
  });

  it("generates nothing for a sense that ja Wiktionary covers", async () => {
    const t = setup();
    await t.wiktionary({ wordSenseId: t.senseId });
    const r = await t.run(t.senseId);
    expect(t.llm.calls()).toHaveLength(0);
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("generates for a sense whose only explanation was rejected", async () => {
    const t = setup();
    await t.wiktionary({ wordSenseId: t.senseId }, "rejected");
    await t.run(t.senseId);
    expect(t.llm.calls()).toHaveLength(1);
  });

  it("drafts an explanation of a Grammar Point", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "ていねいにいうときのいいかた。" }));
    await t.run(t.grammarId);
    const [draft] = await t.auth.rows("japaneseExplanation", { grammarPointId: t.grammarId });
    expect(draft).toMatchObject({ wordSenseId: null, approval: "draft" });
    expect(prompts[0]).toContain("Grammar Point: 〜ます");
    expect(prompts[0]).toContain("polite verb ending");
  });

  it("shows the matching Wiktionary entry as reference and records it as an input", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "ていねいにいうときのいいかた。" }));
    const entry = await t.wiktionary({ grammarPointId: t.grammarId });
    const r = await t.run(t.grammarId);

    expect(prompts[0]).toContain("ウィクショナリーの説明。");
    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(JSON.stringify(run!.inputs)).toContain("ウィクショナリーの説明。");
    const draft = (await t.auth.rows("japaneseExplanation", { grammarPointId: t.grammarId })).find((e) => e.approval === "draft" && e.id !== entry)!;
    expect((await t.auth.rows("provenance", { id: draft.provenanceId }))[0]!.inputs).toContain(entry);
  });

  it("does not show an explanation that is not from Wiktionary", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "せつめい。" }));
    await t.auth.insert("japaneseExplanation", [
      { id: randomUUID(), wordSenseId: null, grammarPointId: t.grammarId, text: "べつの説明。", approval: "approved", retired: false, provenanceId: t.life.provenanceId },
    ]);
    await t.run(t.grammarId);
    expect(prompts[0]).not.toContain("べつの説明。");
  });

  it("passes the last rejection to the next attempt", async () => {
    const prompts: string[] = [];
    const t = setup((p) => (prompts.push(p), { text: "せつめい。" }));
    await t.run(t.senseId, "it uses the headword");
    expect(prompts[0]).toContain("it uses the headword");
  });

  it("uses an attempt when the target is neither a sense nor a Grammar Point", async () => {
    const t = setup();
    const r = await t.run(t.kanjiId);
    expect(t.llm.calls()).toHaveLength(0);
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed" });
  });
});
