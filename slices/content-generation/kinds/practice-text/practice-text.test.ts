import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { ContentGenerate, PracticeGenerate } from "@ibbun/content-graph/jobs";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeLlm, loadLlmConfig } from "@ibbun/llm";
import { createFakeProgress, createFakeTexts } from "@ibbun/progress/testing";
import type { NewPracticeText } from "@ibbun/progress";
import { LearnerId, StudyItemId } from "@ibbun/shared";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";

const learnerId = LearnerId.parse(randomUUID());

const passage = {
  title: "しごと",
  sentences: [
    { text: "わたしは毎日ほんをよむ。", translationEn: "I read books every day." },
    { text: "つくえの上にパンがある。", translationEn: "There is bread on the desk." },
  ],
};

const question = (q: string) => ({ question: q, choices: ["ほん", "パン", "みず", "いす"], answer: 0 });
const dialogue = {
  title: "としょかんで",
  lines: [
    { speaker: "男", text: "なにをよみますか。", translationEn: "What will you read?" },
    { speaker: "女", text: "ほんをよみます。", translationEn: "I will read a book." },
  ],
  questions: [question("女の人はなにをよみますか。"), question("二人はどこにいますか。")],
};

type Choices = Pick<NewPracticeText, "level" | "form" | "passageType" | "length" | "topic">;

const setup = ({ dailyTokenBudget = 1_000_000 }: { dailyTokenBudget?: number } = {}) => {
  const w = world();
  let t = Date.parse("2026-11-06T09:00:00Z");
  const clock = { now: () => new Date((t += 1000)), newId: randomUUID };
  const auth = createFakeAuthoring(w.graph, clock);
  const jobs = createFakeJobs();
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const prompts: string[] = [];
  const llm = createFakeLlm({
    config: loadLlmConfig({}),
    answer: ({ prompt }) => {
      prompts.push(prompt);
      return prompt.includes("dialogue") ? dialogue : passage;
    },
  });
  const generation = contentGeneration({ auth, llm, jobs, progress, texts, config: { dailyTokenBudget, batchTextShare: 0.5 }, now: clock.now });
  const ready = jobs.work(generation.handlers);

  /** What `reading` or `listening` does: records the Practice Text, then enqueues the job. */
  const generate = async ({ level = "N5", form = "passage", passageType = "memo", length = "short", topic }: Partial<Choices> = {}) => {
    await ready;
    const text = await texts.record({
      kind: "practice",
      learnerId,
      passageId: randomUUID(),
      at: clock.now().toISOString(),
      level,
      form,
      passageType,
      length,
      ...(topic ? { topic } : {}),
    });
    await jobs.enqueue(PracticeGenerate, { learnerId, practiceTextId: text.id, level, kind: form });
    await jobs.drain();
    return text;
  };
  /** Passes Learn and then the given scheduled Reviews, a day apart. */
  const review = async (studyItemId: string, ...srs: boolean[]) => {
    const at = (i: number) => new Date(Date.parse("2026-10-01T00:00:00Z") + i * 86_400_000).toISOString();
    const id = StudyItemId.parse(studyItemId);
    await progress.record({ learnerId, studyItemId: id, kind: "learn", passed: true, at: at(0) });
    for (const [i, passed] of srs.entries()) await progress.record({ learnerId, studyItemId: id, kind: "srs", passed, at: at(i + 1) });
  };
  const addWord = (text: string, level: "N5" | "N4" = "N5"): string => {
    const id = randomUUID();
    w.graph.studyItem.push({ id, type: "word", ...w.life });
    w.graph.word.push({ studyItemId: id, priorityTags: [], usuallyKana: false });
    w.graph.wordForm.push({ id: randomUUID(), wordId: id, position: 0, text, ...w.life });
    w.graph.wordReading.push({ id: randomUUID(), wordId: id, position: 0, text, pitchAccent: null, ...w.life });
    w.graph.wordSense.push({ id: randomUUID(), wordId: id, position: 0, partsOfSpeech: ["n"], glosses: [`gloss of ${text}`], ...w.life });
    w.graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...w.life });
    return id;
  };
  const lines = async (passageId: string) => {
    const links = (await auth.rows("passageContainsSentence", { passageId, retired: false })).sort((a, b) => a.position - b.position);
    return Promise.all(links.map(async (l) => ({ speaker: l.speaker, ...(await auth.rows("sentence", { id: l.sentenceId }))[0]! })));
  };
  return { ...w, auth, jobs, texts, prompts, generate, review, addWord, lines };
};

describe("practice.generate for a passage", () => {
  it("writes the Practice Text's passage as a Draft and hands it to review", async () => {
    const t = setup();
    const text = await t.generate();

    const [request] = await t.auth.rows("generationRequest", { kind: "practice-text" });
    expect(request).toMatchObject({ targetId: text.passageId, status: "in review", attempts: 0 });
    const [draft] = await t.auth.rows("readingPassage", { id: text.passageId });
    expect(draft).toMatchObject({ title: "しごと", form: "prose", comprehensionQuestions: [], approval: "draft" });
    expect((await t.lines(text.passageId)).map((l) => [l.speaker, l.text, l.translationEn, l.approval])).toEqual([
      [null, "わたしは毎日ほんをよむ。", "I read books every day.", "draft"],
      [null, "つくえの上にパンがある。", "There is bread on the desk.", "draft"],
    ]);

    const [run] = await t.auth.rows("generationRun", { requestId: request!.id });
    const [provenance] = await t.auth.rows("provenance", { id: draft!.provenanceId });
    expect(provenance).toMatchObject({
      source: { kind: "generated", generationRunId: run!.id, promptTemplateVersion: "practice-text/1" },
      licence: "ibbun",
    });
    expect(t.jobs.pending()).toEqual(["content.review"]);
  });

  it("asks for the chosen type, length and topic at the Practice Text's level", async () => {
    const t = setup();
    await t.generate({ passageType: "email", length: "exam", topic: "仕事" });
    expect(t.prompts[0]).toContain("Write a email of about 250 characters, at JLPT level N5 or easier.");
    expect(t.prompts[0]).toContain("Topic: 仕事");
    await t.generate({ length: "short" });
    expect(t.prompts[1]).toContain("a memo of about 80 characters");
    expect(t.prompts[1]).not.toContain("Topic:");
    await t.generate({ length: "medium" });
    expect(t.prompts[2]).toContain("about 165 characters");
  });

  it("lets the generator pick from the level's passage types when the Learner chose any", async () => {
    const t = setup();
    await t.generate({ passageType: "any" });
    expect(t.prompts[0]).toContain("Write one of memo, notice, email, diary, short explanation of about 80 characters");
  });

  it("gives the Learner's weakest Known items of the level, weakest first, and asks for at least half", async () => {
    const t = setup();
    const strong = t.addWord("ほん");
    const lapsed = t.addWord("つくえ");
    const learning = t.addWord("いす");
    const otherLevel = t.addWord("まど", "N4");
    await t.review(strong, true, true, true);
    await t.review(lapsed, true, false);
    await t.review(learning);
    await t.review(otherLevel, true);
    await t.generate();

    const prompt = t.prompts[0]!;
    expect(prompt).toContain("Use at least half of these items, which the Learner knows least well:");
    expect(prompt).toContain("gloss of つくえ");
    expect(prompt).toContain("gloss of ほん");
    expect(prompt.indexOf("gloss of つくえ")).toBeLessThan(prompt.indexOf("gloss of ほん"));
    expect(prompt).not.toContain("gloss of いす");
    expect(prompt).not.toContain("gloss of まど");

    const [draft] = await t.auth.rows("readingPassage");
    const [provenance] = await t.auth.rows("provenance", { id: draft!.provenanceId });
    const [run] = await t.auth.rows("generationRun");
    expect(JSON.stringify(run!.inputs)).toContain("gloss of つくえ");
    expect(provenance!.inputs).toEqual(expect.arrayContaining(t.graph.wordSense.filter((s) => [strong, lapsed].includes(s.wordId)).map((s) => s.id)));
  });

  it("gives about one weakest item per 50 characters", async () => {
    const t = setup();
    for (const text of ["あ", "い", "う", "え"]) await t.review(t.addWord(text), true);
    await t.generate({ length: "short" });
    expect(t.prompts[0]!.match(/gloss of/g)).toHaveLength(2);
  });

  it("says nothing about earlier items when the Learner knows none of the level", async () => {
    const t = setup();
    await t.generate();
    expect(t.prompts[0]).not.toContain("knows least well");
  });
});

describe("practice.generate for a dialogue", () => {
  it("writes a dialogue passage with a speaker per line and two comprehension questions", async () => {
    const t = setup();
    const text = await t.generate({ form: "dialogue", passageType: "課題理解", length: "exam" });

    const [draft] = await t.auth.rows("readingPassage", { id: text.passageId });
    expect(draft).toMatchObject({ title: "としょかんで", form: "dialogue", comprehensionQuestions: dialogue.questions, approval: "draft" });
    expect((await t.lines(text.passageId)).map((l) => [l.speaker, l.text, l.translationEn])).toEqual([
      ["男", "なにをよみますか。", "What will you read?"],
      ["女", "ほんをよみます。", "I will read a book."],
    ]);
    expect(t.prompts[0]).toContain("Write a dialogue of about 4 lines between 男 and 女, at JLPT level N5 or easier, for a 課題理解 task.");
    expect(t.prompts[0]).toContain("two comprehension questions of two different task types out of 課題理解, ポイント理解.");
  });

  it("grows from about 4 lines at N5 to about 12 at N1, fewer when shorter, and never under 4", async () => {
    const t = setup();
    await t.generate({ form: "dialogue", level: "N1", length: "exam" });
    await t.generate({ form: "dialogue", level: "N1", length: "medium" });
    await t.generate({ form: "dialogue", level: "N1", length: "short" });
    await t.generate({ form: "dialogue", level: "N5", length: "short" });
    expect(t.prompts.map((p) => p.match(/about (\d+) lines/)![1])).toEqual(["12", "9", "6", "4"]);
  });

  it("offers the level's task types when the Learner chose any, 概要理解 only from N3", async () => {
    const t = setup();
    await t.generate({ form: "dialogue", passageType: "any" });
    await t.generate({ form: "dialogue", passageType: "any", level: "N3" });
    expect(t.prompts[0]).toContain("for a 課題理解 or ポイント理解 task.");
    expect(t.prompts[0]).toContain("two comprehension questions of two different task types out of 課題理解, ポイント理解.");
    expect(t.prompts[1]).toContain("for a 課題理解 or ポイント理解 or 概要理解 task.");
  });
});

describe("practice.generate", () => {
  it("does nothing more when the same Practice Text is asked for again", async () => {
    const t = setup();
    const text = await t.generate();
    await t.jobs.enqueue(PracticeGenerate, { learnerId, practiceTextId: text.id, level: "N5", kind: "passage" });
    await t.jobs.drain();
    expect(t.prompts).toHaveLength(1);
    expect(await t.auth.rows("generationRequest", { kind: "practice-text" })).toHaveLength(1);
  });

  it("ignores a job for a Practice Text the Learner never recorded", async () => {
    const t = setup();
    await t.generate();
    await t.jobs.enqueue(PracticeGenerate, { learnerId, practiceTextId: randomUUID(), level: "N5", kind: "passage" });
    await t.jobs.drain();
    expect(await t.auth.rows("generationRequest", { kind: "practice-text" })).toHaveLength(1);
  });

  it("retries with the failures fed back, rewriting the same passage", async () => {
    const t = setup();
    const text = await t.generate();
    const [request] = await t.auth.rows("generationRequest", { kind: "practice-text" });
    expect((await t.auth.failAttempt(request!.id)).status).toBe("open");
    await t.jobs.enqueue(ContentGenerate, { requestId: request!.id, feedback: "「まど」 is N4 and not Known to the Learner." });
    await t.jobs.drain();

    expect(t.prompts[1]).toContain("The previous attempt was rejected: 「まど」 is N4 and not Known to the Learner.");
    expect(await t.auth.rows("readingPassage")).toHaveLength(1);
    expect(await t.lines(text.passageId)).toHaveLength(2);
    expect(await t.auth.rows("passageContainsSentence", { passageId: text.passageId, retired: true })).toHaveLength(2);
  });

  it("draws on the Learner-triggered pool, not the one Content Approval needs", async () => {
    const t = setup({ dailyTokenBudget: 100_000 });
    const general = await t.auth.requestGeneration({ targetId: randomUUID(), kind: "examples", reason: "suspended" });
    await t.auth.recordGenerationRun({ requestId: general.id, model: "m", promptTemplateVersion: "v", inputs: [], tokens: 50_000, cost: 1 });
    await t.generate();
    expect(t.prompts).toHaveLength(1);

    const batch = await t.auth.requestGeneration({ targetId: randomUUID(), kind: "batch-text", reason: "earlier" });
    await t.auth.recordGenerationRun({ requestId: batch.id, model: "m", promptTemplateVersion: "v", inputs: [], tokens: 50_000, cost: 1 });
    await t.generate();
    expect(t.prompts).toHaveLength(1);
    expect(await t.auth.queue({ reason: "budget exhausted" })).toMatchObject([{ detail: { pool: "learner" } }]);
  });
});
