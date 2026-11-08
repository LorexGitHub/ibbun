import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, emptyGraph, type Graph, type Token } from "@mojibun/content-graph/testing";
import { BatchTextGenerate } from "@mojibun/content-graph/jobs";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeLearningPath } from "@mojibun/learning-path/testing";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { StudyItemId } from "@mojibun/shared";
import { BATCH_TEXT_LIMIT_24H, type BatchTextStatus } from "../contract.ts";
import { createLearnApi } from "./api.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const PASSAGE = ID(100);
const TABERU = ID(10);
const MIRU = ID(11);
const NOMU = ID(12);
const NOW = new Date("2026-03-01T10:00:00Z");
const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };

const token = (surface: string, reading: string, start: number): Token => ({
  surface, reading, lemma: surface, partOfSpeech: [], conjugationForm: null, start, end: start + surface.length,
});

const buildGraph = (): Graph => {
  const graph = emptyGraph();
  graph.sentence.push({
    id: ID(2), text: "食べて見る。", translationEn: "I eat and see.",
    tokens: [token("食べて", "タベテ", 0), token("見る", "ミル", 3), token("。", "。", 5)],
    audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life,
  });
  const word = (id: string, form: string, level: "N5" | "N3" | null, n: number) => {
    graph.studyItem.push({ id, type: "word", ...life });
    graph.word.push({ studyItemId: id, priorityTags: [] });
    graph.wordForm.push({ id: ID(n), wordId: id, position: 0, text: form, ...life });
    graph.wordReading.push({ id: ID(n + 1), wordId: id, position: 0, text: form, pitchAccent: null, ...life });
    graph.wordSense.push({ id: ID(n + 2), wordId: id, position: 0, partsOfSpeech: ["v1"], glosses: [`to ${form}`], ...life });
    if (level) graph.levelCandidate.push({ id: ID(n + 3), studyItemId: id, level, kind: "editorial", ...life });
  };
  word(TABERU, "食べる", "N5", 20);
  word(MIRU, "見る", "N3", 30);
  word(NOMU, "飲む", null, 40);
  graph.sentenceUsesWord.push(
    { id: ID(60), sentenceId: ID(2), wordId: TABERU, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 3, ...life },
    { id: ID(61), sentenceId: ID(2), wordId: MIRU, formId: null, readingId: null, senseId: null, spanStart: 3, spanEnd: 5, ...life },
  );
  graph.readingPassage.push({ id: PASSAGE, title: "朝ごはん", form: "prose", comprehensionQuestions: [], ...life });
  graph.passageContainsSentence.push({ id: ID(70), passageId: PASSAGE, sentenceId: ID(2), position: 0, speaker: null, ...life });
  return graph;
};

const setup = async () => {
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const jobs = createFakeJobs();
  const contentGraph = createFakeContentGraph(buildGraph());
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const api = createLearnApi({
    sessions, learners, progress, contentGraph, jobs, texts,
    learningPath: createFakeLearningPath({ contentGraph, progress }),
    now: () => NOW,
  });
  const post = (path: string, body: unknown) =>
    api.request(path, { method: "POST", headers: new Headers([...headers, ["content-type", "application/json"]]), body: JSON.stringify(body) });
  const status = async (ids: string[]) => (await (await api.request(`/batch-text?ids=${ids.join(",")}`, { headers })).json()) as BatchTextStatus;
  const record = (studyItemIds: string[], passageId = PASSAGE, at = NOW.toISOString()) =>
    texts.record({ kind: "batch", learnerId: learner.id, passageId, at, level: "N5", episode: 1, studyItemIds: studyItemIds.map((i) => StudyItemId.parse(i)), episodeSummary: "", cast: ["たろう"] });
  return { learner, learners, progress, texts, jobs, post, status, record };
};

describe("the Batch Text hand-off", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  describe("enqueueing", () => {
    it("queues batch-text.generate for the picked batch", async () => {
      const body = await (await t.post("/batch-text", { studyItemIds: [TABERU, MIRU] })).json();
      expect(body).toEqual({ enqueued: true });
      expect(t.jobs.pending()).toEqual([BatchTextGenerate.name]);
    });

    it("sends the batch's hardest level, an Unlevelled item counting as hardest", async () => {
      const seen: unknown[] = [];
      await t.jobs.work([{ contract: BatchTextGenerate, handle: async (p) => void seen.push(p) }]);
      await t.post("/batch-text", { studyItemIds: [TABERU, MIRU] });
      await t.post("/batch-text", { studyItemIds: [TABERU, NOMU] });
      await t.jobs.drain();
      expect(seen).toEqual([
        { learnerId: t.learner.id, level: "N3", itemIds: [TABERU, MIRU] },
        { learnerId: t.learner.id, level: "unlevelled", itemIds: [TABERU, NOMU] },
      ]);
    });

    it("queues nothing once the Learner has the limit in 24 h", async () => {
      for (let i = 0; i < BATCH_TEXT_LIMIT_24H; i++) await t.record([ID(500 + i)]);
      expect(await (await t.post("/batch-text", { studyItemIds: [TABERU] })).json()).toEqual({ enqueued: false });
      expect(t.jobs.pending()).toEqual([]);
    });

    it("counts only the last 24 h, so older texts do not use up the limit", async () => {
      for (let i = 0; i < BATCH_TEXT_LIMIT_24H; i++) await t.record([ID(500 + i)], PASSAGE, "2026-02-27T10:00:00Z");
      expect(await (await t.post("/batch-text", { studyItemIds: [TABERU] })).json()).toEqual({ enqueued: true });
    });

    it("does not queue a batch that already has its text", async () => {
      await t.record([MIRU, TABERU]);
      expect(await (await t.post("/batch-text", { studyItemIds: [TABERU, MIRU] })).json()).toEqual({ enqueued: false });
    });

    it("refuses a malformed batch", async () => {
      expect((await t.post("/batch-text", { studyItemIds: [] })).status).toBe(400);
    });
  });

  describe("waiting for the text", () => {
    it("says the text is still being prepared until generation wrote it", async () => {
      expect(await t.status([TABERU])).toEqual({ status: "preparing" });
    });

    it("says so while the passage is not approved", async () => {
      await t.record([TABERU], ID(999));
      expect(await t.status([TABERU])).toEqual({ status: "preparing" });
    });

    it("returns the approved text, batch Words and earlier Words highlighted differently", async () => {
      await t.record([TABERU]);
      await t.progress.record({ learnerId: t.learner.id, studyItemId: StudyItemId.parse(MIRU), kind: "learn", passed: true, at: "2026-02-01T10:00:00Z" });
      const status = await t.status([TABERU]);
      if (status.status !== "ready") throw new Error("not ready");
      expect(status.text.title).toBe("朝ごはん");
      expect(status.text.sentences[0]!.translation).toBe("I eat and see.");
      expect(status.text.sentences[0]!.runs.map((r) => [r.text, r.highlight])).toEqual([
        ["食べて", "batch"], ["見る", "earlier"], ["。", null],
      ]);
    });

    it("gives furigana to New Words under the default Mixed setting", async () => {
      await t.record([TABERU]);
      const status = await t.status([TABERU]);
      if (status.status !== "ready") throw new Error("not ready");
      expect(status.text.sentences[0]!.runs[0]!.reading).toBe("たべて");
    });
  });

  describe("lookups", () => {
    it("shows the Word and logs a lookup Review", async () => {
      const body = await (await t.post("/lookups", { wordId: TABERU })).json();
      expect(body).toEqual({ label: "食べる", reading: "食べる", meanings: ["to 食べる"] });
      expect((await t.progress.log(t.learner.id)).map((r) => r.kind)).toEqual(["lookup"]);
    });

    it("refuses what is not a Word", async () => {
      expect((await t.post("/lookups", { wordId: ID(999) })).status).toBe(404);
    });
  });
});
