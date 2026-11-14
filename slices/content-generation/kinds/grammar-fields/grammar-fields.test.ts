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

const token = (surface: string, lemma: string, partOfSpeech: string[], conjugationForm: string | null, start: number) => ({
  surface, reading: surface, lemma, partOfSpeech, conjugationForm, start, end: start + surface.length,
});

/** 食べてしまった: 食べ + て + しまっ + た */
const eaten = [
  token("食べ", "食べる", ["動詞"], "連用形", 0),
  token("て", "て", ["助詞"], null, 2),
  token("しまっ", "しまう", ["動詞", "非自立可能"], "連用形", 3),
  token("た", "た", ["助動詞"], "終止形", 6),
];

const fields = {
  title: "〜てしまう",
  forms: [{ text: "てしまう", register: "polite" }, { text: "ちゃう", register: "casual" }],
  formation: ["V-て", "しまう"],
  register: "neutral",
  meaning: "to do completely, or to do with regret",
  matcherRule: { pattern: [{ lemma: "て" }, { lemma: "しまう" }] },
};

const setup = (answer: (prompt: string) => unknown = () => fields) => {
  const w = world();
  const c = clock();
  const auth = createFakeAuthoring(w.graph, c);
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer: ({ prompt }) => answer(prompt) });
  const generation = contentGeneration({ auth, llm, jobs, progress: createFakeProgress(), texts: createFakeTexts(), config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 }, now: c.now });
  const ready = jobs.work(generation.handlers);

  const id = randomUUID();
  w.graph.studyItem.push({ id, type: "grammar_point", ...w.life, approval: "draft" });
  w.graph.grammarPoint.push({ studyItemId: id, title: "〜てしまう", forms: [], formation: [], register: "neutral", meaning: "", notes: "hanabira: long explanation", matcherRule: null });
  const exampleOf = (text: string, tokens = eaten) => {
    const sentenceId = randomUUID();
    w.graph.sentence.push({ id: sentenceId, text, translationEn: "I ate it all.", tokens, audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...w.life });
    w.graph.example.push({ id: randomUUID(), sentenceId, studyItemId: id, spanStart: 0, spanEnd: text.length, targetSenseId: null, hint: null, comprehensionQuestion: null, ...w.life });
  };
  const run = async (feedback?: string) => {
    await ready;
    const r = await auth.requestGeneration({ targetId: id, kind: "grammar-fields", reason: "missing field" });
    await jobs.enqueue(ContentGenerate, { requestId: r.id, feedback });
    await jobs.drain();
    return r;
  };
  const point = async () => (await auth.rows("grammarPoint", { studyItemId: id }))[0]!;
  return { ...w, id, auth, jobs, ready, run, exampleOf, point };
};

describe("grammar-fields generation", () => {
  it("fills the Grammar Point's fields, keeps it a draft and hands the request to review", async () => {
    const t = setup();
    t.exampleOf("全部食べてしまった。");
    const r = await t.run();

    expect(await t.point()).toMatchObject({ forms: fields.forms, formation: fields.formation, meaning: fields.meaning, matcherRule: fields.matcherRule, notes: "hanabira: long explanation" });
    expect((await t.auth.rows("studyItem", { id: t.id }))[0]!.approval).toBe("draft");
    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]!.status).toBe("in review");
    const [run] = await t.auth.rows("generationRun", { requestId: r.id });
    expect(run!.promptTemplateVersion).toBe("grammar-fields/1");
    const provenance = (await t.auth.rows("provenance")).find((p) => p.source.kind === "generated");
    expect(provenance).toMatchObject({ source: { generationRunId: run!.id }, inputs: expect.arrayContaining([t.id]) });
  });

  it("shows the model the point's current fields and its example Sentences with their tokens", async () => {
    let prompt = "";
    const t = setup((p) => ((prompt = p), fields));
    t.exampleOf("全部食べてしまった。");
    await t.run("the meaning was empty");

    expect(prompt).toContain("hanabira: long explanation");
    expect(prompt).toContain("全部食べてしまった。");
    expect(prompt).toContain("しまう");
    expect(prompt).toContain("the meaning was empty");
  });

  it("rejects a Matcher Rule that misses one of the point's own example Sentences until the attempts run out", async () => {
    const t = setup(() => ({ ...fields, matcherRule: { pattern: [{ lemma: "ちゃう" }] } }));
    t.exampleOf("全部食べてしまった。");
    const r = await t.run();

    expect((await t.point()).matcherRule).toBeNull();
    const [request] = await t.auth.rows("generationRequest", { id: r.id });
    expect(request).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("does not check the rule against example Sentences that have no tokens yet", async () => {
    const t = setup();
    t.exampleOf("全部食べてしまった。", []);
    await t.run();

    expect((await t.point()).matcherRule).toEqual(fields.matcherRule);
  });

  it.each([
    ["no forms", { forms: [] }],
    ["an empty formation", { formation: [] }],
    ["an empty meaning", { meaning: "" }],
    ["an empty Matcher Rule", { matcherRule: { pattern: [] } }],
    ["a Matcher Rule starting with a gap", { matcherRule: { pattern: [{ gap: 2 }, { lemma: "しまう" }] } }],
    ["a Matcher Rule step that requires nothing", { matcherRule: { pattern: [{}] } }],
    ["an unknown register", { register: "rude" }],
  ])("rejects %s", async (_, patch) => {
    const t = setup(() => ({ ...fields, ...patch }));
    await t.run();

    expect((await t.point()).meaning).toBe("");
  });

  it("does nothing for a target that is not a Grammar Point until the attempts run out", async () => {
    const t = setup();
    await t.ready;
    const r = await t.auth.requestGeneration({ targetId: t.wordId, kind: "grammar-fields", reason: "missing field" });
    await t.jobs.enqueue(ContentGenerate, { requestId: r.id });
    await t.jobs.drain();

    expect((await t.auth.rows("generationRequest", { id: r.id }))[0]).toMatchObject({ status: "failed", attempts: 3 });
  });
});
