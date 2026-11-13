import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeLlm, loadLlmConfig } from "@ibbun/llm";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import type { JlptLevel } from "@ibbun/shared";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";
import { requestDialogues } from "./index.ts";

const answer = {
  lines: [
    { speaker: "男", text: "あした、なにをしますか。", translationEn: "What will you do tomorrow?" },
    { speaker: "女", text: "としょかんでべんきょうします。", translationEn: "I will study at the library." },
    { speaker: "男", text: "わたしもいきます。", translationEn: "I will go too." },
    { speaker: "女", text: "じゃあ、九時にあいましょう。", translationEn: "Then let's meet at nine." },
  ],
  questions: [
    { question: "女の人はあしたなにをしますか。", correct: "としょかんでべんきょうする", distractors: ["えいがをみる", "かいものをする", "りょうりをする"] },
    { question: "ふたりはなんじにあいますか。", correct: "九時", distractors: ["八時", "十時", "七時"] },
  ],
};

const setup = () => {
  const w = world();
  let t = Date.parse("2026-11-07T09:00:00Z");
  const clock = { now: () => new Date((t += 1000)), newId: randomUUID };
  const auth = createFakeAuthoring(w.graph, clock);
  const jobs = createFakeJobs();
  const prompts: string[] = [];
  const llm = createFakeLlm({
    config: loadLlmConfig({}),
    answer: ({ prompt }) => {
      prompts.push(prompt);
      return answer;
    },
  });
  const generation = contentGeneration({
    auth, llm, jobs, progress: createFakeProgress(), texts: createFakeTexts(), config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 }, now: clock.now,
  });
  const ready = jobs.work(generation.handlers);
  const run = async (targetId: string, feedback?: string) => {
    await ready;
    const request = await auth.requestGeneration({ targetId, kind: "dialogue", reason: "levelled grammar point" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id, feedback });
    await jobs.drain();
    return request;
  };
  const addGrammar = (title: string, level: JlptLevel | null) => {
    const id = randomUUID();
    w.graph.studyItem.push({ id, type: "grammar_point", ...w.life });
    w.graph.grammarPoint.push({
      studyItemId: id, title, forms: [{ text: title, register: "casual" }], formation: [title], register: "neutral", meaning: `meaning of ${title}`, notes: null, matcherRule: null,
    });
    if (level) w.graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...w.life });
    return id;
  };
  const clipOf = async (requestTargetId: string) => {
    const [request] = await auth.rows("generationRequest", { targetId: requestTargetId, kind: "dialogue" });
    const [provenance] = (await auth.rows("provenance")).filter((p) => p.source.kind === "generated");
    const [item] = await auth.rows("studyItem", { provenanceId: provenance!.id });
    return { request: request!, provenance: provenance!, item: item! };
  };
  const lines = async (clipId: string) =>
    Promise.all(
      (await auth.rows("clipVoicesSentence", { clipId, retired: false }))
        .sort((a, b) => a.position - b.position)
        .map(async (l) => ({ ...l, sentence: (await auth.rows("sentence", { id: l.sentenceId }))[0]! })),
    );
  return { ...w, auth, jobs, prompts, run, addGrammar, clipOf, lines };
};

describe("dialogue kind", () => {
  it("writes the dialogue, its Sentences and both questions as Drafts of one Generation Run, and hands them to review", async () => {
    const t = setup();
    await t.run(t.grammarId);

    const { request, provenance, item } = await t.clipOf(t.grammarId);
    expect(request).toMatchObject({ status: "in review", attempts: 0 });
    expect(item).toMatchObject({ type: "listening_clip", approval: "draft", retired: false });
    expect(await t.auth.rows("listeningClip", { studyItemId: item.id })).toEqual([{ studyItemId: item.id, kind: "dialogue" }]);

    const voiced = await t.lines(item.id);
    expect(voiced.map((l) => [l.position, l.speaker, l.sentence.text, l.sentence.translationEn, l.sentence.approval])).toEqual([
      [0, "男", "あした、なにをしますか。", "What will you do tomorrow?", "draft"],
      [1, "女", "としょかんでべんきょうします。", "I will study at the library.", "draft"],
      [2, "男", "わたしもいきます。", "I will go too.", "draft"],
      [3, "女", "じゃあ、九時にあいましょう。", "Then let's meet at nine.", "draft"],
    ]);

    const examples = await t.auth.rows("example", { studyItemId: item.id });
    expect(examples.map((e) => [e.approval, e.comprehensionQuestion])).toEqual([
      ["draft", { question: "女の人はあしたなにをしますか。", choices: ["としょかんでべんきょうする", "えいがをみる", "かいものをする", "りょうりをする"], answer: 0 }],
      ["draft", { question: "ふたりはなんじにあいますか。", choices: ["九時", "八時", "十時", "七時"], answer: 0 }],
    ]);

    const [run] = await t.auth.rows("generationRun", { requestId: request.id });
    expect(provenance).toMatchObject({ source: { kind: "generated", generationRunId: run!.id, promptTemplateVersion: "dialogue/1" }, licence: "ibbun" });
    expect(provenance.inputs).toContain(t.grammarId);
    const records = [item, ...voiced, ...voiced.map((l) => l.sentence), ...examples];
    expect(new Set(records.map((r) => r.provenanceId))).toEqual(new Set([provenance.id]));
    expect(t.jobs.pending()).toEqual(["content.review"]);
  });

  it("gives the two speakers two different voices, the same ones on every line", async () => {
    const t = setup();
    await t.run(t.grammarId);
    const voiced = await t.lines((await t.clipOf(t.grammarId)).item.id);
    const voiceOf = new Map(voiced.map((l) => [l.speaker, l.voice]));
    expect(voiceOf.size).toBe(2);
    expect(voiceOf.get("男")).not.toBe(voiceOf.get("女"));
    for (const l of voiced) expect(l.voice).toBe(voiceOf.get(l.speaker));
  });

  it("asks for a 男/女 dialogue of the level's length using the Grammar Point, with two different 聴解 task types", async () => {
    const t = setup();
    await t.run(t.grammarId);
    const n1 = t.addGrammar("〜をもって", "N1");
    await t.run(n1);

    const [n5, atN1] = t.prompts;
    expect(n5).toContain("about 4 lines");
    expect(n5).toContain("JLPT level N5");
    expect(n5).toContain("〜ます");
    expect(n5).toContain("男");
    expect(n5).toContain("女");
    expect(n5).not.toContain("概要理解");
    expect(n5).toMatch(/課題理解[\s\S]*ポイント理解|ポイント理解[\s\S]*課題理解/);
    expect(atN1).toContain("about 12 lines");
    expect(atN1).toContain("〜をもって");
  });

  it("rotates the pair of task types across the dialogues of a level", async () => {
    const t = setup();
    const ids = ["〜ようだ", "〜らしい", "〜はず"].map((title) => t.addGrammar(title, "N3"));
    for (const id of ids) await t.run(id);
    const pairs = t.prompts.map((p) => ["課題理解", "ポイント理解", "概要理解"].filter((type) => p.includes(type)).join("+"));
    expect(pairs).toEqual(["課題理解+ポイント理解", "ポイント理解+概要理解", "課題理解+概要理解"]);
  });

  it("rewrites the same clip on a retry and retires the rejected attempt's lines and questions", async () => {
    const t = setup();
    const target = t.addGrammar("〜ようだ", "N3");
    await t.run(target);
    const first = (await t.clipOf(target)).item;
    await t.auth.failAttempt((await t.clipOf(target)).request.id);
    await t.run(target, "line 3 has no clear speaker turn");

    expect(t.prompts[1]).toContain("The previous attempt was rejected: line 3 has no clear speaker turn");
    expect((await t.auth.rows("studyItem", { type: "listening_clip" })).map((i) => i.id)).toEqual([first.id]);
    expect(await t.auth.rows("listeningClip", { studyItemId: first.id })).toHaveLength(1);
    const types = (p: string) => ["課題理解", "ポイント理解", "概要理解"].filter((type) => p.includes(type));
    expect(types(t.prompts[1]!)).toEqual(types(t.prompts[0]!));
    const retried = await t.lines(first.id);
    expect(retried).toHaveLength(4);
    const [item] = await t.auth.rows("studyItem", { id: first.id });
    expect(item!.provenanceId).toBe(retried[0]!.provenanceId);
    expect(item!.provenanceId).not.toBe(first.provenanceId);
    expect(await t.auth.rows("clipVoicesSentence", { clipId: first.id, retired: true })).toHaveLength(4);
    expect(await t.auth.rows("example", { studyItemId: first.id, retired: false })).toHaveLength(2);
    expect(await t.auth.rows("example", { studyItemId: first.id, retired: true })).toHaveLength(2);
  });

  it("generates nothing for an unlevelled Grammar Point or a target that is not a Grammar Point", async () => {
    const t = setup();
    for (const target of [t.addGrammar("〜っけ", null), t.wordId]) {
      await t.run(target);
      const [request] = await t.auth.rows("generationRequest", { targetId: target, kind: "dialogue" });
      expect(request!.attempts).toBeGreaterThan(0);
      expect(request!.status).not.toBe("in review");
    }
    expect(t.prompts).toEqual([]);
    expect(await t.auth.rows("studyItem", { type: "listening_clip" })).toEqual([]);
  });
});

describe("requestDialogues", () => {
  it("opens one dialogue request per levelled Grammar Point, once", async () => {
    const t = setup();
    const n4 = t.addGrammar("〜てしまう", "N4");
    t.addGrammar("〜っけ", null);
    const draft = t.addGrammar("〜ちゃう", "N4");
    t.graph.studyItem.find((i) => i.id === draft)!.approval = "draft";

    expect(await requestDialogues(t.auth, t.jobs)).toBe(2);
    expect(await requestDialogues(t.auth, t.jobs)).toBe(0);

    const requests = await t.auth.rows("generationRequest", { kind: "dialogue" });
    expect(requests.map((r) => r.targetId).sort()).toEqual([t.grammarId, n4].sort());
    expect(t.jobs.pending()).toEqual(["content.generate", "content.generate"]);
  });
});
