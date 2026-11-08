import { beforeEach, describe, expect, it } from "vitest";
import { createAuthGuards, createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, emptyGraph, type Graph, type Token } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { StudyItemId } from "@mojibun/shared";
import { createReadingApi } from "../server/reading-api.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const PASSAGE = ID(100);
const DRAFT_PASSAGE = ID(101);
const TABERU = ID(10);
const MIRU = ID(11);
const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };

const token = (surface: string, reading: string, start: number): Token => ({
  surface, reading, lemma: surface, partOfSpeech: [], conjugationForm: null, start, end: start + surface.length,
});

const buildGraph = (): Graph => {
  const graph = emptyGraph();
  graph.sentence.push(
    { id: ID(2), text: "パンを食べる。", translationEn: "I eat bread.", tokens: [token("パン", "パン", 0), token("を", "ヲ", 2), token("食べる", "タベル", 3), token("。", "。", 6)], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
    { id: ID(3), text: "本を見る。", translationEn: null, tokens: [token("本", "ホン", 0), token("を", "ヲ", 1), token("見る", "ミル", 2), token("。", "。", 4)], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
  );
  const word = (id: string, form: string, reading: string, gloss: string, n: number) => {
    graph.studyItem.push({ id, type: "word", ...life });
    graph.word.push({ studyItemId: id, priorityTags: [] });
    graph.wordForm.push({ id: ID(n), wordId: id, position: 0, text: form, ...life });
    graph.wordReading.push({ id: ID(n + 1), wordId: id, position: 0, text: reading, pitchAccent: null, ...life });
    graph.wordSense.push({ id: ID(n + 2), wordId: id, position: 0, partsOfSpeech: ["v1"], glosses: [gloss, "to devour"], ...life });
  };
  word(TABERU, "食べる", "たべる", "to eat", 20);
  word(MIRU, "見る", "みる", "to see", 30);
  graph.sentenceUsesWord.push(
    { id: ID(40), sentenceId: ID(2), wordId: TABERU, formId: null, readingId: null, senseId: null, spanStart: 3, spanEnd: 6, ...life },
    { id: ID(41), sentenceId: ID(3), wordId: MIRU, formId: null, readingId: null, senseId: null, spanStart: 2, spanEnd: 4, ...life },
  );
  graph.readingPassage.push(
    { id: PASSAGE, title: "朝ごはん", form: "prose", comprehensionQuestions: [], ...life },
    { id: DRAFT_PASSAGE, title: "下書き", form: "prose", comprehensionQuestions: [], ...life, approval: "draft" },
  );
  graph.passageContainsSentence.push(
    { id: ID(50), passageId: PASSAGE, sentenceId: ID(2), position: 0, ...life },
    { id: ID(51), passageId: PASSAGE, sentenceId: ID(3), position: 1, ...life },
  );
  return graph;
};

const setup = async () => {
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const texts = createFakeTexts();
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const app = createReadingApi({
    contentGraph: createFakeContentGraph(buildGraph()),
    progress, texts, learners,
    guards: createAuthGuards(sessions),
    now: () => new Date("2026-03-01T10:00:00Z"),
  });
  const get = (path: string, h: Headers = headers) => app.request(path, { headers: h });
  const post = (path: string, body: unknown, h: Headers = headers) =>
    app.request(path, { method: "POST", headers: new Headers([...h, ["content-type", "application/json"]]), body: JSON.stringify(body) });
  const batchText = (episode: number, level: "N5" | "N4" | "unlevelled", passageId: string, at = "2026-02-01T10:00:00Z") =>
    texts.record({ kind: "batch", learnerId: learner.id, passageId, at, level, episode, studyItemIds: [TABERU], episodeSummary: "", cast: ["たろう"] });
  return { learner, learners, progress, texts, headers, get, post, batchText };
};

const runTexts = (view: { sentences: { runs: { text: string; reading: string | null }[] }[] }) =>
  view.sentences.map((s) => s.runs.filter((r) => r.reading).map((r) => r.reading));

describe("reading API", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it("refuses a request without a session", async () => {
    expect((await t.get("/episodes", new Headers())).status).toBe(401);
    expect((await t.post("/lookups", {}, new Headers())).status).toBe(401);
  });

  describe("episodes", () => {
    it("lists ready Batch Texts per level, easiest level first and episodes in order", async () => {
      await t.batchText(2, "N5", PASSAGE);
      await t.batchText(1, "N5", PASSAGE);
      const unlevelled = await t.batchText(1, "unlevelled", PASSAGE);
      const n4 = await t.batchText(1, "N4", PASSAGE);
      const body = await (await t.get("/episodes")).json();
      expect(body.levels.map((l: { level: string }) => l.level)).toEqual(["N5", "N4", "unlevelled"]);
      expect(body.levels[0].episodes.map((e: { episode: number }) => e.episode)).toEqual([1, 2]);
      expect(body.levels[0].episodes[0]).toMatchObject({ title: "朝ごはん", at: "2026-02-01T10:00:00.000Z" });
      expect(body.levels[1].episodes[0].id).toBe(n4.id);
      expect(body.levels[2].episodes[0].id).toBe(unlevelled.id);
    });

    it("leaves out a Batch Text whose passage is not approved yet", async () => {
      await t.batchText(1, "N5", DRAFT_PASSAGE);
      expect(await (await t.get("/episodes")).json()).toEqual({ levels: [] });
    });

    it("shows a Learner only their own Batch Texts", async () => {
      await t.batchText(1, "N5", PASSAGE);
      const other = await t.learners.add({ email: "b@example.com" });
      await t.texts.record({ kind: "batch", learnerId: other.id, passageId: PASSAGE, at: "2026-02-03T10:00:00Z", level: "N4", episode: 1, studyItemIds: [TABERU], episodeSummary: "", cast: ["x"] });
      const body = await (await t.get("/episodes")).json();
      expect(body.levels.map((l: { level: string }) => l.level)).toEqual(["N5"]);
    });
  });

  describe("a Batch Text", () => {
    it("serves its Sentences with translations, Word links and the batch's Words marked", async () => {
      const text = await t.batchText(3, "N5", PASSAGE);
      const view = await (await t.get(`/batch-texts/${text.id}`)).json();
      expect(view).toMatchObject({ title: "朝ごはん", episode: { level: "N5", number: 3 } });
      expect(view.sentences.map((s: { translation: string | null }) => s.translation)).toEqual(["I eat bread.", null]);
      const eat = view.sentences[0].runs.find((r: { text: string }) => r.text === "食べる");
      expect(eat).toMatchObject({ wordId: TABERU, inBatch: true });
      const see = view.sentences[1].runs.find((r: { text: string }) => r.text === "見る");
      expect(see).toMatchObject({ wordId: MIRU, inBatch: false });
      expect(view.sentences[0].runs.find((r: { text: string }) => r.text === "を")).toMatchObject({ wordId: null, inBatch: false });
    });

    it("is not found for another id, a draft passage, or another Learner's text", async () => {
      expect((await t.get(`/batch-texts/${ID(999)}`)).status).toBe(404);
      const draft = await t.batchText(1, "N5", DRAFT_PASSAGE);
      expect((await t.get(`/batch-texts/${draft.id}`)).status).toBe(404);
    });

    it("follows the furigana setting: Mixed shows New Words only, On every kanji Word, Off none", async () => {
      const text = await t.batchText(1, "N5", PASSAGE);
      await t.progress.record({ learnerId: t.learner.id, studyItemId: StudyItemId.parse(TABERU), kind: "learn", passed: true, at: "2026-02-02T10:00:00Z" });
      const read = async () => runTexts(await (await t.get(`/batch-texts/${text.id}`)).json());

      expect(await read()).toEqual([[], ["ほん", "みる"]]);
      await t.learners.changePreferences(t.learner.id, { furigana: "on" });
      expect(await read()).toEqual([["たべる"], ["ほん", "みる"]]);
      await t.learners.changePreferences(t.learner.id, { furigana: "off" });
      expect(await read()).toEqual([[], []]);
    });
  });

  describe("a Reading Passage", () => {
    it("serves the passage with no episode and nothing marked", async () => {
      const view = await (await t.get(`/passages/${PASSAGE}`)).json();
      expect(view.episode).toBeNull();
      expect(view.sentences.flatMap((s: { runs: { inBatch: boolean }[] }) => s.runs).some((r: { inBatch: boolean }) => r.inBatch)).toBe(false);
      expect((await t.get(`/passages/${DRAFT_PASSAGE}`)).status).toBe(404);
    });
  });

  describe("lookups", () => {
    it("answers with the Word and logs a `lookup` Review that does not introduce it", async () => {
      const res = await t.post("/lookups", { wordId: TABERU });
      expect(await res.json()).toEqual({ label: "食べる", reading: "たべる", meanings: ["to eat", "to devour"] });
      const log = await t.progress.log(t.learner.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ kind: "lookup", studyItemId: TABERU, at: "2026-03-01T10:00:00.000Z" });
      expect(await t.progress.introduced(t.learner.id)).toEqual([]);
    });

    it("refuses what is not a lookup of a Word, and logs nothing", async () => {
      expect((await t.post("/lookups", { nope: 1 })).status).toBe(400);
      expect((await t.post("/lookups", { wordId: ID(999) })).status).toBe(404);
      expect(await t.progress.log(t.learner.id)).toEqual([]);
    });
  });
});
