import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@mojibun/content-graph/testing";
import { BatchTextGenerate, ContentGenerate } from "@mojibun/content-graph/jobs";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeLlm, loadLlmConfig } from "@mojibun/llm";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";

const learnerId = LearnerId.parse(randomUUID());
const item = (id: string) => StudyItemId.parse(id);

const passage = (summary: string) => ({
  title: "かいもの",
  sentences: [
    { text: "ゆきはパンを食べる。", translationEn: "Yuki eats bread." },
    { text: "たろうはみずをのむ。", translationEn: "Taro drinks water." },
  ],
  cast: ["ゆき", "たろう"],
  episodeSummary: summary,
});

const setup = ({ dailyTokenBudget = 1_000_000 }: { dailyTokenBudget?: number } = {}) => {
  const w = world();
  let t = Date.parse("2026-11-06T09:00:00Z");
  const clock = { now: () => new Date((t += 1000)), newId: randomUUID };
  const auth = createFakeAuthoring(w.graph, clock);
  const jobs = createFakeJobs();
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const prompts: string[] = [];
  let summary = "ゆきはたべものをかった。";
  const llm = createFakeLlm({
    config: loadLlmConfig({}),
    answer: ({ prompt }) => {
      prompts.push(prompt);
      return passage(summary);
    },
  });
  const generation = contentGeneration({ auth, llm, jobs, progress, texts, config: { dailyTokenBudget, batchTextShare: 0.5 }, now: clock.now });
  const ready = jobs.work(generation.handlers);
  const pick = async (itemIds: string[], level: "N5" | "unlevelled" = "N5") => {
    await ready;
    await jobs.enqueue(BatchTextGenerate, { learnerId, level, itemIds: itemIds.map(item) as [StudyItemId, ...StudyItemId[]] });
    await jobs.drain();
  };
  const met = async (studyItemId: string, ...kinds: ("learn" | "srs")[]) => {
    for (const [i, kind] of kinds.entries())
      await progress.record({
        learnerId,
        studyItemId: item(studyItemId),
        kind,
        passed: true,
        at: new Date(Date.parse("2026-11-01T00:00:00Z") + i * 86_400_000).toISOString(),
      });
  };
  const addWord = (text: string, level: "N5" | null = "N5") => {
    const id = randomUUID();
    w.graph.studyItem.push({ id, type: "word", ...w.life });
    w.graph.word.push({ studyItemId: id, priorityTags: [] });
    w.graph.wordForm.push({ id: randomUUID(), wordId: id, position: 0, text, ...w.life });
    w.graph.wordReading.push({ id: randomUUID(), wordId: id, position: 0, text, pitchAccent: null, ...w.life });
    w.graph.wordSense.push({ id: randomUUID(), wordId: id, position: 0, partsOfSpeech: ["n"], glosses: [`gloss of ${text}`], ...w.life });
    if (level) w.graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...w.life });
    return id;
  };
  return { ...w, auth, jobs, texts, prompts, generation, pick, met, addWord, setSummary: (s: string) => (summary = s) };
};

describe("batch-text.generate", () => {
  it("writes a Draft Reading Passage and the Batch Text record, and hands the draft to review", async () => {
    const t = setup();
    await t.pick([t.wordId, t.grammarId]);

    const [request] = await t.auth.rows("generationRequest", { kind: "batch-text" });
    expect(request).toMatchObject({ status: "in review", attempts: 0 });
    const [draft] = await t.auth.rows("readingPassage", { id: request!.targetId });
    expect(draft).toMatchObject({ title: "かいもの", form: "prose", approval: "draft", retired: false });
    const links = (await t.auth.rows("passageContainsSentence", { passageId: draft!.id })).sort((a, b) => a.position - b.position);
    const sentences = await Promise.all(links.map(async (l) => (await t.auth.rows("sentence", { id: l.sentenceId }))[0]!));
    expect(sentences.map((s) => [s.text, s.translationEn, s.approval])).toEqual([
      ["ゆきはパンを食べる。", "Yuki eats bread.", "draft"],
      ["たろうはみずをのむ。", "Taro drinks water.", "draft"],
    ]);

    const [run] = await t.auth.rows("generationRun", { requestId: request!.id });
    const [provenance] = await t.auth.rows("provenance", { id: draft!.provenanceId });
    expect(provenance).toMatchObject({
      source: { kind: "generated", generationRunId: run!.id, promptTemplateVersion: "reading-passage/1" },
      licence: "mojibun",
    });
    expect(provenance!.inputs).toEqual(expect.arrayContaining([t.wordId, t.senseId, t.grammarId]));

    expect(await t.texts.batchTexts(learnerId)).toMatchObject([
      {
        passageId: draft!.id,
        level: "N5",
        episode: 1,
        studyItemIds: [t.wordId, t.grammarId],
        episodeSummary: "ゆきはたべものをかった。",
        cast: ["ゆき", "たろう"],
      },
    ]);
    expect(t.jobs.pending()).toEqual(["content.review"]);
  });

  it("asks for a first episode with a new cast, at the shortest length and the first passage type", async () => {
    const t = setup();
    await t.pick([t.wordId]);
    expect(t.prompts[0]).toContain("episode 1 as a memo of about 80 characters, at JLPT level N5");
    expect(t.prompts[0]).toContain("first episode: invent a small recurring cast");
    expect(t.prompts[0]).toContain("食べる");
    expect(t.prompts[0]).toContain("to eat");
  });

  it("continues the story: the next passage type, the cast and the running summary", async () => {
    const t = setup();
    await t.pick([t.wordId]);
    t.setSummary("ゆきとたろうは店でパンをかい、いっしょに食べた。");
    await t.pick([t.grammarId]);
    expect(t.prompts[1]).toContain("episode 2 as a notice");
    expect(t.prompts[1]).toContain("ゆき、たろう");
    expect(t.prompts[1]).toContain("ゆきはたべものをかった。");
    await t.pick([t.addWord("パン")]);
    expect(t.prompts[2]).toContain("episode 3 as a email");
    expect(t.prompts[2]).toContain("ゆきとたろうは店でパンをかい、いっしょに食べた。");
    expect((await t.texts.batchTexts(learnerId)).map((x) => x.episode)).toEqual([1, 2, 3]);
  });

  it("grows the target length with the share of the level met, and brings back the weakest earlier items first", async () => {
    const t = setup();
    const known = t.addWord("ほん");
    const shaky = t.addWord("つくえ");
    t.addWord("いす");
    t.addWord("まど");
    await t.met(known, "learn", "srs");
    await t.met(shaky, "learn");
    await t.pick([t.wordId]);
    // 2 of the 6 N5 items are met, so 80 + 170 / 3 = 137 characters.
    const prompt = t.prompts[0]!;
    expect(prompt).toContain("about 137 characters");
    expect(prompt).toContain("gloss of つくえ");
    expect(prompt).toContain("gloss of ほん");
    expect(prompt.indexOf("gloss of つくえ")).toBeLessThan(prompt.indexOf("gloss of ほん"));
  });

  it("does not bring back items of other levels or the batch itself", async () => {
    const t = setup();
    await t.met(t.kanjiId, "learn");
    await t.met(t.wordId, "learn");
    await t.pick([t.wordId]);
    expect(t.prompts[0]).not.toContain("Kanji: 食");
    expect(t.prompts[0]).not.toContain("earlier items");
  });

  it("makes an Unlevelled batch's text from the Unlevelled items met", async () => {
    const t = setup();
    const id = t.addWord("謎", null);
    await t.pick([id], "unlevelled");
    expect(t.prompts[0]).toContain("episode 1 as a memo of about 200 characters, at JLPT level N1");
    expect(await t.texts.batchTexts(learnerId)).toMatchObject([{ level: "unlevelled", episode: 1 }]);
  });

  it("retries with the failures fed back, rewriting the same passage and keeping one Batch Text record", async () => {
    const t = setup();
    await t.pick([t.wordId]);
    const [request] = await t.auth.rows("generationRequest", { kind: "batch-text" });
    const [first] = await t.auth.rows("readingPassage", { id: request!.targetId });
    const oldLinks = await t.auth.rows("passageContainsSentence", { passageId: first!.id });

    // content-approval rejects the draft and enqueues the next attempt.
    expect((await t.auth.failAttempt(request!.id)).status).toBe("open");
    await t.jobs.enqueue(ContentGenerate, { requestId: request!.id, feedback: "The batch word 食べる does not appear." });
    await t.jobs.drain();

    expect(t.prompts[1]).toContain("The previous attempt was rejected: The batch word 食べる does not appear.");
    expect(t.prompts[1]).toContain("episode 1 as a memo");
    expect(await t.auth.rows("readingPassage")).toHaveLength(1);
    const links = await t.auth.rows("passageContainsSentence", { passageId: first!.id });
    expect(links.filter((l) => !l.retired)).toHaveLength(2);
    expect(links.filter((l) => l.retired).map((l) => l.id).sort()).toEqual(oldLinks.map((l) => l.id).sort());
    expect(await t.texts.batchTexts(learnerId)).toHaveLength(1);
  });

  it("does nothing when the same batch is requested again", async () => {
    const t = setup();
    await t.pick([t.wordId, t.grammarId]);
    await t.pick([t.grammarId, t.wordId]);
    expect(t.prompts).toHaveLength(1);
    expect(await t.auth.rows("generationRequest", { kind: "batch-text" })).toHaveLength(1);
    expect(await t.texts.batchTexts(learnerId)).toHaveLength(1);
  });

  it("checks the Learner-triggered pool before the call and pauses when it is spent", async () => {
    const t = setup({ dailyTokenBudget: 100_000 });
    const spent = await t.auth.requestGeneration({ targetId: randomUUID(), kind: "batch-text", reason: "earlier" });
    await t.auth.recordGenerationRun({ requestId: spent.id, model: "m", promptTemplateVersion: "v", inputs: [], tokens: 50_000, cost: 1 });
    await t.pick([t.wordId]);
    expect(t.prompts).toEqual([]);
    expect(await t.auth.queue({ reason: "budget exhausted" })).toMatchObject([{ detail: { pool: "learner" } }]);
    expect(await t.texts.batchTexts(learnerId)).toEqual([]);
    expect(t.jobs.pending()).toEqual([]);
  });

  it("fails the request after three attempts when the batch's items are gone", async () => {
    const t = setup();
    await t.pick([randomUUID()]);
    expect(t.prompts).toEqual([]);
    const [request] = await t.auth.rows("generationRequest", { kind: "batch-text" });
    expect(request).toMatchObject({ status: "failed", attempts: 3 });
    expect(await t.auth.queue({ reason: "generation failed" })).toHaveLength(1);
    expect(await t.texts.batchTexts(learnerId)).toEqual([]);
  });
});
