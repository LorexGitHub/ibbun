import { beforeEach, describe, expect, it } from "vitest";
import { createAuthGuards, createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, emptyGraph, type Graph, type Token } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import type { StudyItemId } from "@mojibun/shared";
import { createReviewsApi } from "../../server/api.ts";
import { withListening } from "../server/with-listening.ts";
import { createClipReviewsApi } from "../server/clip-reviews-api.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}` as StudyItemId;
const SENTENCE_CLIP = ID(10);
const DIALOGUE_CLIP = ID(20);
const SENTENCE_EXAMPLE = ID(11);
const DIALOGUE_EXAMPLES = [ID(21), ID(22)];
const LEARNED = "2026-02-01T10:00:00.000Z";
const NOW = new Date("2026-03-01T10:00:00Z");
const clockAt = (now: Date) => ({ now });

const token = (surface: string, reading: string, start: number): Token => ({
  surface, reading, lemma: surface, partOfSpeech: [], conjugationForm: null, start, end: start + surface.length,
});

const buildGraph = (): Graph => {
  const graph = emptyGraph();
  const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };
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
  example(SENTENCE_EXAMPLE, SENTENCE_CLIP, 2, null);

  sentence(4, "明日は何をしますか。", [], "What will you do tomorrow?", null);
  sentence(5, "買い物に行きます。", [], "I will go shopping.", null);
  clip(DIALOGUE_CLIP, "dialogue");
  voice(6, DIALOGUE_CLIP, 4, 0, "男", "audio/d0.ogg");
  voice(7, DIALOGUE_CLIP, 5, 1, "女", "audio/d1.ogg");
  example(DIALOGUE_EXAMPLES[0]!, DIALOGUE_CLIP, 4, { question: "女の人は明日何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"], answer: 0 });
  example(DIALOGUE_EXAMPLES[1]!, DIALOGUE_CLIP, 5, { question: "女の人はどこへ行きますか。", choices: ["駅", "店", "学校", "家"], answer: 1 });
  return graph;
};

type ClipJson = { clipId: string; exampleId: string };

const setup = async () => {
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const clock = clockAt(NOW);
  const contentGraph = createFakeContentGraph(buildGraph());
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const deps = { contentGraph, progress, learners, guards: createAuthGuards(sessions), now: () => clock.now, random: () => 0 };
  const app = createClipReviewsApi(deps);
  const learn = (id: StudyItemId) => progress.record({ learnerId: learner.id, studyItemId: id, kind: "learn", passed: true, at: LEARNED });
  const get = (path: string, h: Headers = headers) => app.request(path, { headers: h });
  const post = (path: string, body: unknown, h: Headers = headers) =>
    app.request(path, { method: "POST", headers: new Headers([...h, ["content-type", "application/json"]]), body: JSON.stringify(body) });
  const answer = (clipId: StudyItemId, body: object) => post("/answer", { clipId, ...body });
  const log = (id: StudyItemId) => progress.log(learner.id, id);
  const due = async () => ((await (await get("/due")).json()) as { clips: ClipJson[] }).clips;
  return { deps, clock, sessions, learners, progress, contentGraph, learner, headers, get, post, answer, learn, log, due };
};

describe("scheduled Listening Clip Reviews", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
    await t.learn(SENTENCE_CLIP);
    await t.learn(DIALOGUE_CLIP);
  });

  it("refuses a request without a session", async () => {
    expect((await t.get("/due", new Headers())).status).toBe(401);
    expect((await t.post("/answer", {}, new Headers())).status).toBe(401);
  });

  it("lists the clips that are due, without their text", async () => {
    const raw = await (await t.get("/due")).text();
    expect(JSON.parse(raw).clips.map((c: ClipJson) => c.clipId).sort()).toEqual([SENTENCE_CLIP, DIALOGUE_CLIP].sort());
    expect(raw).not.toContain("パン");
    expect(raw).not.toContain("I eat");
  });

  it("keeps to one JLPT Level when asked", async () => {
    const at = async (level: string) => ((await (await t.get(`/due?level=${level}`)).json()) as { clips: ClipJson[] }).clips.map((c) => c.clipId).sort();
    expect(await at("N5")).toEqual([SENTENCE_CLIP, DIALOGUE_CLIP].sort());
    expect(await at("N4")).toEqual([]);
  });

  it("lists nothing before a clip is learned", async () => {
    expect(await (await setup()).due()).toEqual([]);
  });

  it("asks a Sentence clip by dictation and a dialogue by comprehension with shuffled options", async () => {
    const clips = await t.due();
    const sentence = clips.find((c) => c.clipId === SENTENCE_CLIP);
    const dialogue = clips.find((c) => c.clipId === DIALOGUE_CLIP) as unknown as { question: { prompt: string; choices: string[] } };
    expect(sentence).toMatchObject({ exampleId: SENTENCE_EXAMPLE, question: { kind: "dictation" }, audio: [{ src: "/audio/audio/bread.ogg", speaker: "女" }] });
    expect(dialogue.question.prompt).toBe("女の人は明日何をしますか。");
    expect([...dialogue.question.choices].sort()).toEqual(["仕事", "勉強", "料理", "買い物"].sort());
  });

  it("alternates a dialogue between its two questions", async () => {
    const asked = async () => (await t.due()).find((c) => c.clipId === DIALOGUE_CLIP)?.exampleId;
    expect(await asked()).toBe(DIALOGUE_EXAMPLES[0]);
    await t.answer(DIALOGUE_CLIP, { exampleId: DIALOGUE_EXAMPLES[0], input: "買い物" });
    t.clock.now = new Date("2027-03-01T10:00:00Z");
    expect(await asked()).toBe(DIALOGUE_EXAMPLES[1]);
    await t.answer(DIALOGUE_CLIP, { exampleId: DIALOGUE_EXAMPLES[1], input: "店" });
    t.clock.now = new Date("2029-03-01T10:00:00Z");
    expect(await asked()).toBe(DIALOGUE_EXAMPLES[0]);
  });

  it("tells the client the Learner's Exam Mode and slow speed", async () => {
    await t.learners.changePreferences(t.learner.id, { examMode: true, slowAudio: true });
    expect((await t.due())[0]).toMatchObject({ examMode: true, slowAudio: true });
  });

  it("passes a right dictation, logs an srs Review with the replays, and shows the transcript", async () => {
    const res = await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをたべる", replays: 2, slow: true });
    expect(await res.json()).toEqual({
      outcome: "pass",
      transcript: [{ speaker: "女", text: "パンを食べる。", translation: "I eat bread.", audio: "/audio/audio/bread.ogg" }],
    });
    expect((await t.log(SENTENCE_CLIP)).at(-1)).toMatchObject({
      kind: "srs",
      passed: true,
      exampleId: SENTENCE_EXAMPLE,
      at: NOW.toISOString(),
      facets: [{ facet: "dictation", rawInput: "ぱんをたべる", outcome: "pass" }],
      listening: { replays: 2, slow: true, examMode: false },
    });
  });

  it("moves the schedule: a passed clip is no longer due", async () => {
    await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "パンを食べる" });
    expect((await t.due()).map((c) => c.clipId)).toEqual([DIALOGUE_CLIP]);
  });

  it("fails a wrong dictation with a diff per token, and still shows the transcript", async () => {
    const body = await (await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "パンを食べた" })).json();
    expect(body.outcome).toBe("fail");
    expect(body.diff).toEqual([
      { surface: "パン", reading: "パン", status: "correct" },
      { surface: "を", reading: "ヲ", status: "correct" },
      { surface: "食べる", reading: "タベル", status: "wrong", typed: "食べた" },
    ]);
    expect(body.extra).toBe("");
    expect(body.transcript).toHaveLength(1);
    expect((await t.log(SENTENCE_CLIP)).at(-1)).toMatchObject({ kind: "srs", passed: false });
  });

  it("gives no diff on a pass or a comprehension question", async () => {
    expect(await (await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "パンを食べる" })).json()).not.toHaveProperty("diff");
    const wrong = await (await t.answer(DIALOGUE_CLIP, { exampleId: DIALOGUE_EXAMPLES[0], input: "勉強" })).json();
    expect(wrong).toMatchObject({ outcome: "fail", correctChoice: "買い物" });
    expect(wrong).not.toHaveProperty("diff");
  });

  it("grades a comprehension choice on the server", async () => {
    const pass = await (await t.answer(DIALOGUE_CLIP, { exampleId: DIALOGUE_EXAMPLES[0], input: "買い物" })).json();
    expect(pass.outcome).toBe("pass");
    expect(pass.transcript).toHaveLength(2);
  });

  it("counts Show answer as a fail and records it", async () => {
    const body = await (await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "", revealed: true })).json();
    expect(body.outcome).toBe("fail");
    expect((await t.log(SENTENCE_CLIP)).at(-1)).toMatchObject({ passed: false, revealed: true });
  });

  it("does not grade a try that is not an answer, and stores nothing", async () => {
    const before = (await t.log(SENTENCE_CLIP)).length;
    expect(await (await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "" })).json()).toEqual({ outcome: "retry" });
    expect((await t.log(SENTENCE_CLIP)).length).toBe(before);
  });

  it("logs Exam Mode and never a replay or slow speed under it", async () => {
    await t.learners.changePreferences(t.learner.id, { examMode: true });
    await t.answer(SENTENCE_CLIP, { exampleId: SENTENCE_EXAMPLE, input: "パンを食べる", replays: 3, slow: true });
    expect((await t.log(SENTENCE_CLIP)).at(-1)).toMatchObject({ listening: { replays: 0, slow: false, examMode: true } });
  });

  it("rejects a malformed answer and an unknown clip or Example", async () => {
    expect((await t.post("/answer", { nope: 1 })).status).toBe(400);
    expect((await t.answer(SENTENCE_CLIP, { exampleId: "no-such", input: "x" })).status).toBe(404);
    expect((await t.answer(ID(999), { exampleId: SENTENCE_EXAMPLE, input: "x" })).status).toBe(404);
  });

  it("is mounted under /listening beside the reviews API, and /due leaves clips to it", async () => {
    const reviewsApi = createReviewsApi({ sessions: t.sessions, learners: t.learners, progress: t.progress, contentGraph: t.contentGraph, now: () => NOW });
    const api = withListening(reviewsApi, { ...t.deps, random: () => 0 });
    const { clips } = await (await api.request("/listening/due", { headers: t.headers })).json();
    expect(clips).toHaveLength(2);
    const { reviews } = await (await api.request("/due", { headers: t.headers })).json();
    expect(reviews).toEqual([]);
  });
});
