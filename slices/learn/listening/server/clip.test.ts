import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture, type Graph, type Token } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeLearningPath } from "@mojibun/learning-path/testing";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { createFakeJobs } from "@mojibun/jobs";
import type { LearnerId } from "@mojibun/shared";
import type { Batch } from "../../contract.ts";
import { createLearnApi } from "../../server/learn-api.ts";
import type { ClipLesson, ClipVerdict } from "../contract.ts";

const ID = (n: number) => `00000999-0000-7000-8000-${String(n).padStart(12, "0")}`;
const SENTENCE_CLIP = ID(10);
const DIALOGUE_CLIP = ID(20);
const NOW = new Date("2026-11-06T09:00:00.000Z");

const token = (surface: string, reading: string, start: number): Token => ({
  surface, reading, lemma: surface, partOfSpeech: [], conjugationForm: null, start, end: start + surface.length,
});

const addClips = (graph: Graph, wordId: string, grammarId: string, kanaWordId: string) => {
  const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };
  graph.provenance.push({ id: ID(1), source: { kind: "fixture" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
  const sentence = (id: number, text: string, tokens: Token[], en: string, key: string | null) =>
    graph.sentence.push({ id: ID(id), text, translationEn: en, tokens, audioKey: key, audioVoice: "四国めたん", unlevelledWordCount: 0, ...life });
  const clip = (id: string, kind: "sentence" | "dialogue") => {
    graph.studyItem.push({ id, type: "listening_clip", ...life });
    graph.listeningClip.push({ studyItemId: id, kind });
    graph.levelCandidate.push({ id: ID(Number(id.slice(-2)) + 500), studyItemId: id, level: "N5", kind: "derived", ...life });
  };
  const voice = (n: number, clipId: string, sentenceId: number, position: number, speaker: "男" | "女", audioKey: string | null) =>
    graph.clipVoicesSentence.push({ id: ID(n), clipId, sentenceId: ID(sentenceId), position, speaker, voice: "四国めたん", audioKey, ...life });
  const example = (id: string, studyItemId: string, sentenceId: number, comprehensionQuestion: Graph["example"][number]["comprehensionQuestion"]) =>
    graph.example.push({ id, sentenceId: ID(sentenceId), studyItemId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion, ...life });

  sentence(2, "パンを食べる。", [token("パン", "パン", 0), token("を", "ヲ", 2), token("食べる", "タベル", 3), token("。", "。", 6)], "I eat bread.", "audio/bread.ogg");
  clip(SENTENCE_CLIP, "sentence");
  voice(3, SENTENCE_CLIP, 2, 0, "女", null);
  graph.sentenceUsesWord.push({ id: ID(4), sentenceId: ID(2), wordId, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life });
  example(ID(11), SENTENCE_CLIP, 2, null);

  sentence(5, "明日は何をしますか。", [], "What will you do tomorrow?", "audio/d0.ogg");
  sentence(6, "買い物に行きます。", [], "I will go shopping.", "audio/d1.ogg");
  clip(DIALOGUE_CLIP, "dialogue");
  voice(7, DIALOGUE_CLIP, 5, 0, "男", null);
  voice(8, DIALOGUE_CLIP, 6, 1, "女", null);
  graph.sentenceDemonstratesGrammar.push({ id: ID(9), sentenceId: ID(5), grammarPointId: grammarId, spanStart: 0, spanEnd: 1, ...life });
  graph.sentenceUsesWord.push({ id: ID(12), sentenceId: ID(6), wordId: kanaWordId, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life });
  example(ID(21), DIALOGUE_CLIP, 5,{ question: "女の人は明日何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"], answer: 0 });
};

const setup = async () => {
  const fixture = n5Fixture();
  const kanaWord = fixture.ids.words["火"]!;
  fixture.graph.wordForm = fixture.graph.wordForm.filter((f) => f.wordId !== kanaWord);
  addClips(fixture.graph, fixture.ids.words["日本"]!, fixture.ids.grammar["〜です"]!, kanaWord);
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const contentGraph = createFakeContentGraph(fixture.graph);
  const learningPath = createFakeLearningPath({ contentGraph, progress });
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const api = createLearnApi({ sessions, learners, progress, contentGraph, learningPath, jobs: createFakeJobs(), texts: createFakeTexts(), now: () => NOW, random: () => 0 });
  await learningPath.setActiveTracks(learner.id as LearnerId, [{ level: "N5", type: "listening_clip" }]);
  const post = (path: string, body: unknown, as: Headers = headers) =>
    api.request(path, { method: "POST", headers: new Headers([...as, ["content-type", "application/json"]]), body: JSON.stringify(body) });
  const clips = async () => {
    const { items } = (await (await api.request("/batch", { headers })).json()) as Batch;
    return items.flatMap((i) => ("clip" in i ? [i.clip] : []));
  };
  const answer = async (clip: ClipLesson, input: string, extra: object = {}) => {
    const response = await post("/clip/answer", { studyItemId: clip.studyItemId, exampleId: clip.exampleId, input, ...extra });
    return { status: response.status, verdict: (await response.json()) as ClipVerdict };
  };
  return { learner: learner.id as LearnerId, learners, progress, headers, post, clips, answer };
};

describe("a Listening Clip lesson in a batch", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
    await t.learners.changePreferences(t.learner, { batchSize: 20 });
  });

  it("teaches a Sentence clip with its audio, transcript and a dictation quiz", async () => {
    const clip = (await t.clips()).find((c) => c.studyItemId === SENTENCE_CLIP)!;
    expect(clip.lines).toEqual([{ speaker: "女", text: "パンを食べる。", translationEn: "I eat bread.", src: "/audio/audio/bread.ogg" }]);
    expect(clip.question).toEqual({ kind: "dictation" });
  });

  it("links the Words and Grammar Points the clip's Sentences use, a Word with no written form by its reading", async () => {
    const labels = async (id: string) => (await t.clips()).find((c) => c.studyItemId === id)!.links.map((l) => l.label);
    expect(await labels(SENTENCE_CLIP)).toEqual(["日本"]);
    expect((await labels(DIALOGUE_CLIP)).sort()).toEqual(["〜です", "ひ"]);
  });

  it("teaches a dialogue by comprehension, without saying which option is right", async () => {
    const clip = (await t.clips()).find((c) => c.studyItemId === DIALOGUE_CLIP)!;
    expect(clip.lines.map((l) => l.speaker)).toEqual(["男", "女"]);
    expect(clip.question).toMatchObject({ kind: "comprehension", choices: expect.arrayContaining(["買い物", "勉強", "仕事", "料理"]) });
    expect(JSON.stringify(clip)).not.toMatch(/answer"/);
  });

  it("carries the Learner's Exam Mode and slow-speed settings for the quiz step", async () => {
    await t.learners.changePreferences(t.learner, { examMode: true, slowAudio: true });
    expect((await t.clips())[0]).toMatchObject({ examMode: true, slowAudio: true });
  });
});

describe("answering a Listening Clip quiz", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
    await t.learners.changePreferences(t.learner, { batchSize: 20 });
  });
  const find = async (id: string) => (await t.clips()).find((c) => c.studyItemId === id)!;

  it("records a `learn` Review with the listening detail when a dictation passes", async () => {
    const clip = await find(SENTENCE_CLIP);
    const { verdict } = await t.answer(clip, "パンをたべる", { attempts: ["pan"], replays: 2, slow: true, timeToAnswerMs: 1200 });
    expect(verdict).toEqual({ outcome: "pass" });
    const [review] = await t.progress.log(t.learner, SENTENCE_CLIP as never);
    expect(review).toMatchObject({
      kind: "learn",
      passed: true,
      exampleId: clip.exampleId,
      attempts: [{ facet: "dictation", input: "pan" }],
      listening: { replays: 2, slow: true, examMode: false },
      timeToAnswerMs: 1200,
    });
    expect(review!.facets).toMatchObject([{ facet: "dictation", outcome: "pass" }]);
  });

  it("stores nothing for a miss, and gives the right option after a comprehension miss", async () => {
    const clip = await find(DIALOGUE_CLIP);
    expect((await t.answer(clip, "勉強")).verdict).toEqual({ outcome: "fail", correctChoice: "買い物" });
    expect((await t.answer(await find(SENTENCE_CLIP), "ちがう")).verdict).toEqual({ outcome: "fail" });
    expect(await t.progress.log(t.learner)).toEqual([]);
  });

  it("asks again, and stores nothing, when the try is not an answer", async () => {
    expect((await t.answer(await find(SENTENCE_CLIP), "")).verdict).toEqual({ outcome: "retry" });
    expect(await t.progress.log(t.learner)).toEqual([]);
  });

  it("ignores replays and slow speed in Exam Mode, which plays once", async () => {
    await t.learners.changePreferences(t.learner, { examMode: true });
    const clip = await find(SENTENCE_CLIP);
    await t.answer(clip, "パンをたべる", { replays: 3, slow: true });
    const [review] = await t.progress.log(t.learner, SENTENCE_CLIP as never);
    expect(review!.listening).toEqual({ replays: 0, slow: false, examMode: true });
  });

  it("refuses an unknown clip, a wrong Example and a malformed answer", async () => {
    const clip = await find(SENTENCE_CLIP);
    expect((await t.answer({ ...clip, exampleId: ID(99) }, "x")).status).toBe(404);
    expect((await t.answer({ ...clip, studyItemId: ID(98) as never }, "x")).status).toBe(404);
    expect((await t.post("/clip/answer", { input: 1 })).status).toBe(400);
    expect((await t.post("/clip/answer", {}, new Headers())).status).toBe(401);
  });
});
