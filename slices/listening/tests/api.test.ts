import { beforeEach, describe, expect, it } from "vitest";
import { createAuthGuards, createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, emptyGraph, type Graph, type Token } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { createListeningApi } from "../server/api.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const SENTENCE_CLIP = ID(10);
const DIALOGUE_CLIP = ID(20);
const OTHER_LEVEL_CLIP = ID(30);
const SENTENCE_EXAMPLE = ID(11);
const DIALOGUE_EXAMPLES = [ID(21), ID(22)];

const token = (surface: string, reading: string, start: number): Token => ({
  surface, reading, lemma: surface, partOfSpeech: [], conjugationForm: null, start, end: start + surface.length,
});

const buildGraph = (): Graph => {
  const graph = emptyGraph();
  const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };
  const sentence = (id: number, text: string, tokens: Token[], en: string, key: string | null) =>
    graph.sentence.push({ id: ID(id), text, translationEn: en, tokens, audioKey: key, audioVoice: "四国めたん", unlevelledWordCount: 0, ...life });
  const clip = (id: string, kind: "sentence" | "dialogue", level: Graph["levelCandidate"][number]["level"]) => {
    graph.studyItem.push({ id, type: "listening_clip", ...life });
    graph.listeningClip.push({ studyItemId: id, kind });
    graph.levelCandidate.push({ id: ID(Number(id.slice(-2)) + 500), studyItemId: id, level, kind: "derived", ...life });
  };
  const voice = (n: number, clipId: string, sentenceId: number, position: number, speaker: "男" | "女", audioKey: string | null) =>
    graph.clipVoicesSentence.push({ id: ID(n), clipId, sentenceId: ID(sentenceId), position, speaker, voice: "四国めたん", audioKey, ...life });
  const example = (id: string, studyItemId: string, sentenceId: number, comprehensionQuestion: Graph["example"][number]["comprehensionQuestion"]) =>
    graph.example.push({ id, sentenceId: ID(sentenceId), studyItemId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion, ...life });

  sentence(2, "パンを食べる。", [token("パン", "パン", 0), token("を", "ヲ", 2), token("食べる", "タベル", 3), token("。", "。", 6)], "I eat bread.", "audio/bread.ogg");
  clip(SENTENCE_CLIP, "sentence", "N5");
  voice(3, SENTENCE_CLIP, 2, 0, "女", null);
  example(SENTENCE_EXAMPLE, SENTENCE_CLIP, 2, null);

  sentence(4, "明日は何をしますか。", [], "What will you do tomorrow?", null);
  sentence(5, "買い物に行きます。", [], "I will go shopping.", null);
  clip(DIALOGUE_CLIP, "dialogue", "N5");
  voice(6, DIALOGUE_CLIP, 4, 0, "男", "audio/d0.ogg");
  voice(7, DIALOGUE_CLIP, 5, 1, "女", "audio/d1.ogg");
  example(DIALOGUE_EXAMPLES[0]!, DIALOGUE_CLIP, 4, { question: "女の人は明日何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"], answer: 0 });
  example(DIALOGUE_EXAMPLES[1]!, DIALOGUE_CLIP, 5, { question: "女の人はどこへ行きますか。", choices: ["駅", "店", "学校", "家"], answer: 1 });

  clip(OTHER_LEVEL_CLIP, "sentence", "N4");
  return graph;
};

const setup = async () => {
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const app = createListeningApi({
    contentGraph: createFakeContentGraph(buildGraph()),
    progress,
    learners,
    texts: createFakeTexts(),
    jobs: createFakeJobs(),
    practiceLimit: 5,
    guards: createAuthGuards(sessions),
    now: () => new Date("2026-03-01T10:00:00Z"),
    random: () => 0,
  });
  const get = (path: string, h: Headers = headers) => app.request(path, { headers: h });
  const post = (path: string, body: unknown, h: Headers = headers) =>
    app.request(path, { method: "POST", headers: new Headers([...h, ["content-type", "application/json"]]), body: JSON.stringify(body) });
  return { app, learner, learners, progress, headers, get, post };
};

describe("listening practice API", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it("refuses a request without a session", async () => {
    expect((await t.get("/clips?level=N5", new Headers())).status).toBe(401);
    expect((await t.post(`/clips/${SENTENCE_CLIP}/answer`, {}, new Headers())).status).toBe(401);
  });

  it("has no clip to serve for an id it does not know", async () => {
    expect((await t.get(`/clips/${ID(99)}`)).status).toBe(404);
  });

  it("lists the clips of the chosen level", async () => {
    const body = await (await t.get("/clips?level=N5")).json();
    expect(body).toEqual({ level: "N5", clipIds: [SENTENCE_CLIP, DIALOGUE_CLIP] });
    expect((await t.get("/clips?level=N9")).status).toBe(400);
  });

  it("serves a Sentence clip as audio and a dictation box, without its text", async () => {
    const res = await t.get(`/clips/${SENTENCE_CLIP}`);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({
      clipId: SENTENCE_CLIP,
      exampleId: SENTENCE_EXAMPLE,
      audio: [{ src: "/audio/audio/bread.ogg", speaker: "女" }],
      question: { kind: "dictation" },
      examMode: false,
      slowAudio: false,
    });
    expect(raw).not.toContain("パン");
    expect(raw).not.toContain("I eat");
  });

  it("serves a dialogue as one audio per line and a comprehension question with shuffled options", async () => {
    const view = await (await t.get(`/clips/${DIALOGUE_CLIP}`)).json();
    expect(view.audio).toEqual([
      { src: "/audio/audio/d0.ogg", speaker: "男" },
      { src: "/audio/audio/d1.ogg", speaker: "女" },
    ]);
    expect(view.exampleId).toBe(DIALOGUE_EXAMPLES[0]);
    expect(view.question.prompt).toBe("女の人は明日何をしますか。");
    expect([...view.question.choices].sort()).toEqual(["仕事", "勉強", "料理", "買い物"].sort());
    expect(JSON.stringify(view)).not.toContain("明日は何を");
  });

  it("rotates to the other question once the first has been answered", async () => {
    await t.post(`/clips/${DIALOGUE_CLIP}/answer`, { exampleId: DIALOGUE_EXAMPLES[0], input: "買い物" });
    const view = await (await t.get(`/clips/${DIALOGUE_CLIP}`)).json();
    expect(view.exampleId).toBe(DIALOGUE_EXAMPLES[1]);
  });

  it("tells the shell a Learner's Exam Mode and slow speed", async () => {
    await t.learners.changePreferences(t.learner.id, { examMode: true, slowAudio: true });
    const view = await (await t.get(`/clips/${SENTENCE_CLIP}`)).json();
    expect(view).toMatchObject({ examMode: true, slowAudio: true });
  });

  it("passes a right dictation, shows the transcript, and logs a cram Review that does not schedule", async () => {
    const res = await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをたべる", replays: 2, slow: true });
    expect(await res.json()).toEqual({
      outcome: "pass",
      transcript: [{ speaker: "女", text: "パンを食べる。", translation: "I eat bread.", audio: "/audio/audio/bread.ogg" }],
    });
    const [review] = await t.progress.log(t.learner.id, SENTENCE_CLIP as never);
    expect(review).toMatchObject({
      kind: "cram",
      passed: true,
      exampleId: SENTENCE_EXAMPLE,
      at: "2026-03-01T10:00:00.000Z",
      facets: [{ facet: "dictation", rawInput: "ぱんをたべる", normalisedInput: "ぱんをたべる", outcome: "pass" }],
      listening: { replays: 2, slow: true, examMode: false },
    });
    expect(await t.progress.due(t.learner.id, new Date("2030-01-01"))).toEqual([]);
  });

  it("fails a wrong dictation", async () => {
    const body = await (await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをのむ" })).json();
    expect(body.outcome).toBe("fail");
    const [review] = await t.progress.log(t.learner.id);
    expect(review).toMatchObject({ passed: false, facets: [{ outcome: "fail" }] });
  });

  it("grades the option the Learner chose, wherever the shuffle put it, and names the right one", async () => {
    const right = await (await t.post(`/clips/${DIALOGUE_CLIP}/answer`, { exampleId: DIALOGUE_EXAMPLES[0], input: "買い物" })).json();
    expect(right).toMatchObject({ outcome: "pass", correctChoice: "買い物" });
    expect(right.transcript).toHaveLength(2);
    const wrong = await (await t.post(`/clips/${DIALOGUE_CLIP}/answer`, { exampleId: DIALOGUE_EXAMPLES[1], input: "駅" })).json();
    expect(wrong).toMatchObject({ outcome: "fail", correctChoice: "店" });
  });

  it("asks again, and records nothing, when the input is not an answer; the tries are kept on the graded Review", async () => {
    const retry = await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "pan" });
    expect(await retry.json()).toEqual({ outcome: "retry" });
    expect(await t.progress.log(t.learner.id)).toEqual([]);
    await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをたべる", attempts: ["pan", ""] });
    const [review] = await t.progress.log(t.learner.id);
    expect(review!.attempts).toEqual([
      { facet: "dictation", input: "pan" },
      { facet: "dictation", input: "" },
    ]);
  });

  it("counts Show answer as a fail, whatever was typed", async () => {
    const res = await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをたべる", revealed: true });
    expect((await res.json()).outcome).toBe("fail");
    const [review] = await t.progress.log(t.learner.id);
    expect(review).toMatchObject({ passed: false, revealed: true, facets: [{ outcome: "fail" }] });
  });

  it("logs Exam Mode from the Learner's setting, with no replays and no slow speed", async () => {
    await t.learners.changePreferences(t.learner.id, { examMode: true });
    await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: SENTENCE_EXAMPLE, input: "ぱんをたべる", replays: 3, slow: true });
    const [review] = await t.progress.log(t.learner.id);
    expect(review!.listening).toEqual({ replays: 0, slow: false, examMode: true });
  });

  it("answers 404 for a clip that is not there and for an Example that is not the clip's", async () => {
    expect((await t.get(`/clips/${ID(999)}`)).status).toBe(404);
    expect((await t.post(`/clips/${SENTENCE_CLIP}/answer`, { exampleId: DIALOGUE_EXAMPLES[0], input: "x" })).status).toBe(404);
    expect((await t.get(`/clips/${OTHER_LEVEL_CLIP}`)).status).toBe(404);
  });

  it("answers 400 for a malformed answer", async () => {
    expect((await t.post(`/clips/${SENTENCE_CLIP}/answer`, { input: 3 })).status).toBe(400);
  });
});
