import { beforeEach, describe, expect, it } from "vitest";
import { createAuthGuards, createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, emptyGraph, type Graph } from "@mojibun/content-graph/testing";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { createListeningApi } from "../../server/listening-api.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const KANJI = ID(10);
const PASSAGE = ID(20);
const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };

/** An N5 with one Kanji, and a dialogue passage that is approved (and so ready) once `withPassage` is on. */
const buildGraph = (withPassage: boolean): Graph => {
  const graph = emptyGraph();
  graph.studyItem.push({ id: KANJI, type: "kanji", ...life });
  graph.levelCandidate.push({ id: ID(11), studyItemId: KANJI, level: "N5", kind: "derived", ...life });
  graph.kanji.push({ studyItemId: KANJI } as never);
  // A Kanji with no approved Example is suspended, and a suspended Kanji does not count toward a Cleared Level.
  graph.sentence.push({ id: ID(50), text: "日", translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
  graph.example.push({ id: ID(51), sentenceId: ID(50), studyItemId: KANJI, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
  if (!withPassage) return graph;
  graph.readingPassage.push({
    id: PASSAGE,
    title: "会話",
    form: "dialogue",
    comprehensionQuestions: [
      { question: "女の人は何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"], answer: 0 },
      { question: "どこへ行きますか。", choices: ["駅", "店", "学校", "家"], answer: 1 },
    ],
    ...life,
  });
  for (const [n, speaker] of [[0, "男"], [1, "女"]] as const) {
    graph.sentence.push({ id: ID(30 + n), text: `秘密の台詞${n}`, translationEn: "x", tokens: [], audioKey: `d${n}.ogg`, audioVoice: "v", unlevelledWordCount: 0, ...life });
    graph.passageContainsSentence.push({ id: ID(40 + n), passageId: PASSAGE, sentenceId: ID(30 + n), position: n, speaker, ...life });
  }
  return graph;
};

const setup = async (withPassage = false) => {
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const jobs = createFakeJobs();
  const learner = await learners.add({ email: "a@example.com" });
  const other = await learners.add({ email: "b@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const otherHeaders = sessions.signIn({ learnerId: other.id, role: "learner" });
  const app = createListeningApi({
    contentGraph: createFakeContentGraph(buildGraph(withPassage)),
    progress, learners, texts, jobs, practiceLimit: 2,
    guards: createAuthGuards(sessions),
    now: () => new Date("2026-03-01T10:00:00Z"),
    random: () => 0,
  });
  const send = (path: string, method: string, body?: unknown, h: Headers = headers) =>
    app.request(`/practice${path}`, { method, headers: new Headers([...h, ["content-type", "application/json"]]), body: body === undefined ? undefined : JSON.stringify(body) });
  return { learner, progress, texts, jobs, headers, otherHeaders, get: (p: string, h?: Headers) => send(p, "GET", undefined, h), post: (p: string, b: unknown, h?: Headers) => send(p, "POST", b, h) };
};

const request = { level: "N5", passageType: "any", length: "short" };
const knowKanji = (t: Awaited<ReturnType<typeof setup>>) =>
  t.progress.record({ learnerId: t.learner.id, studyItemId: KANJI as never, kind: "manual", passed: true, at: "2026-02-01T00:00:00Z" });

describe("Practice Text dialogues", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup(true);
  });

  it("offers only the levels whose Kanji the Learner knows, and how many are left today", async () => {
    expect(await (await t.get("/options")).json()).toEqual({ cleared: [], remaining: 2 });
    await knowKanji(t);
    expect(await (await t.get("/options")).json()).toEqual({ cleared: ["N5"], remaining: 2 });
  });

  it("refuses a level that is not cleared, and nothing is recorded or queued", async () => {
    const res = await t.post("", request);
    expect(res.status).toBe(403);
    expect(await t.texts.practiceTexts(t.learner.id)).toEqual([]);
    expect(t.jobs.pending()).toEqual([]);
  });

  it("refuses a request that is not one of the fixed choices", async () => {
    await knowKanji(t);
    for (const bad of [{ ...request, length: "huge" }, { ...request, passageType: "ポイント理解!" }, { ...request, topic: "free text" }, { ...request, level: "N9" }]) {
      expect((await t.post("", bad)).status).toBe(400);
    }
  });

  it("records a dialogue Practice Text and queues its generation", async () => {
    await knowKanji(t);
    const res = await t.post("", { ...request, passageType: "課題理解", topic: "旅行" });
    expect(res.status).toBe(202);
    const { id } = await res.json();
    const [text] = await t.texts.practiceTexts(t.learner.id);
    expect(text).toMatchObject({ id, level: "N5", form: "dialogue", passageType: "課題理解", length: "short", topic: "旅行" });
    expect(t.jobs.pending()).toEqual(["practice.generate"]);
  });

  it("says try again tomorrow at the limit, and queues nothing more", async () => {
    await knowKanji(t);
    await t.post("", request);
    await t.post("", request);
    const res = await t.post("", request);
    expect(res.status).toBe(429);
    expect((await res.json()).message).toMatch(/tomorrow/);
    expect(t.jobs.pending()).toHaveLength(2);
    expect(await (await t.get("/options")).json()).toMatchObject({ remaining: 0 });
  });

  it("lists the library, with a text ready only once its passage is approved", async () => {
    await knowKanji(t);
    const { id } = await (await t.post("", request)).json();
    const [mine] = await (await t.get("")).json();
    expect(mine).toMatchObject({ id, level: "N5", ready: false });
    expect(await (await t.get("", t.otherHeaders)).json()).toEqual([]);
  });

  it("is private to the Learner who generated it", async () => {
    await knowKanji(t);
    const { id } = await (await t.post("", request)).json();
    expect((await t.get(`/${id}`, t.otherHeaders)).status).toBe(404);
    expect((await t.post(`/${id}/answer`, { exampleId: "0", input: "x" }, t.otherHeaders)).status).toBe(404);
  });
});

describe("a ready Practice Text dialogue", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let id: string;
  beforeEach(async () => {
    t = await setup(true);
    await knowKanji(t);
    const recorded = await t.texts.record({
      kind: "practice", learnerId: t.learner.id, passageId: PASSAGE, at: "2026-03-01T09:00:00Z",
      level: "N5", form: "dialogue", passageType: "any", length: "short",
    });
    id = recorded.id;
  });

  it("plays as audio and a question, with no text", async () => {
    const res = await t.get(`/${id}`);
    const raw = await res.text();
    expect(JSON.parse(raw)).toMatchObject({
      clipId: id,
      exampleId: "0",
      audio: [{ src: "/audio/d0.ogg", speaker: "男" }, { src: "/audio/d1.ogg", speaker: "女" }],
      question: { prompt: "女の人は何をしますか。" },
    });
    expect(raw).not.toContain("秘密の台詞");
  });

  it("grades the answer, shows the transcript and logs a cram Review without scheduling", async () => {
    const res = await t.post(`/${id}/answer`, { exampleId: "0", input: "買い物", replays: 1 });
    expect(await res.json()).toMatchObject({
      outcome: "pass",
      correctChoice: "買い物",
      transcript: [{ speaker: "男", text: "秘密の台詞0" }, { speaker: "女", text: "秘密の台詞1" }],
    });
    const [review] = (await t.progress.log(t.learner.id)).filter((r) => r.kind === "cram");
    expect(review).toMatchObject({ studyItemId: PASSAGE, passed: true, exampleId: `${PASSAGE}:0`, listening: { replays: 1, slow: false, examMode: false } });
    expect(await t.progress.due(t.learner.id, new Date("2030-01-01"))).not.toContain(PASSAGE);
  });

  it("fails a wrong option, and the second question comes next", async () => {
    expect((await (await t.post(`/${id}/answer`, { exampleId: "0", input: "勉強" })).json()).outcome).toBe("fail");
    expect((await (await t.get(`/${id}`)).json()).exampleId).toBe("1");
  });

  it("answers retry for input that is not an option, without logging", async () => {
    expect(await (await t.post(`/${id}/answer`, { exampleId: "0", input: "?" })).json()).toEqual({ outcome: "retry" });
    expect((await t.progress.log(t.learner.id)).filter((r) => r.kind === "cram")).toEqual([]);
  });

  it("counts Show answer as a fail", async () => {
    const res = await t.post(`/${id}/answer`, { exampleId: "0", input: "", revealed: true });
    expect((await res.json()).outcome).toBe("fail");
  });

  it("is not ready, and says so, while its passage is not approved", async () => {
    const pending = await setup(false);
    await knowKanji(pending);
    const { id: pendingId } = await (await pending.post("", request)).json();
    const res = await pending.get(`/${pendingId}`);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "pending" });
  });
});
