import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeLearningPath } from "@mojibun/learning-path/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import type { Batch, CompleteRequest, QuizPrompt, State } from "../contract.ts";
import { createLearnApi } from "./api.ts";

const NOW = new Date("2026-11-06T09:00:00.000Z");
const DAY_MS = 86_400_000;

const setup = async (mutate: (graph: ReturnType<typeof n5Fixture>["graph"]) => void = () => undefined) => {
  const fixture = n5Fixture();
  mutate(fixture.graph);
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const contentGraph = createFakeContentGraph(fixture.graph);
  const learningPath = createFakeLearningPath({ contentGraph, progress });
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const api = createLearnApi({ sessions, learners, progress, contentGraph, learningPath, now: () => NOW });
  const send = (method: string, path: string, body?: unknown, as: Headers = headers) =>
    api.request(path, {
      method,
      headers: new Headers([...as, ["content-type", "application/json"]]),
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
    });
  const get = (path: string, as: Headers = headers) => api.request(path, { headers: as });
  const batch = async () => (await (await get("/batch")).json()) as Batch;
  const state = async () => (await (await get("/state")).json()) as State;
  const prefer = (change: object) => learners.changePreferences(learner.id, change);
  return { fixture, learner: learner.id as LearnerId, learningPath, progress, send, get, batch, state, prefer };
};

const answerFor = (facet: QuizPrompt["facets"][number]) => {
  if (facet.answerData.facet === "meaning") return facet.answerData.meanings[0]!.text;
  const accepted = facet.answerData.accepted[0]!;
  return accepted.reading ?? accepted.written;
};

const correct = (prompt: QuizPrompt): CompleteRequest["answers"][number] => ({
  studyItemId: prompt.studyItemId,
  exampleId: prompt.exampleId,
  facets: prompt.facets.map((f) => ({ facet: f.facet, input: answerFor(f), attempts: [] })),
});

describe("the learn API", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it("refuses a request with no session", async () => {
    for (const [method, path] of [["GET", "/state"], ["PUT", "/tracks"], ["GET", "/batch"], ["POST", "/skip"], ["POST", "/complete"]] as const) {
      expect((await t.send(method, path, {}, new Headers())).status, path).toBe(401);
    }
  });

  describe("the Active Track grid", () => {
    it("starts as the N5 Tracks, with the Learner's batch size and budget and nothing learned today", async () => {
      expect(await t.state()).toEqual({
        activeTracks: [
          { level: "N5", type: "kanji" },
          { level: "N5", type: "word" },
          { level: "N5", type: "grammar_point" },
        ],
        batchSize: 5,
        dailyBudget: 15,
        learnedToday: 0,
      });
    });

    it("replaces the Active Tracks and keeps Listening Tracks the grid does not show", async () => {
      await t.learningPath.setActiveTracks(t.learner, [{ level: "N5", type: "word" }, { level: "N4", type: "listening_clip" }]);
      const response = await t.send("PUT", "/tracks", { tracks: [{ level: "N3", type: "grammar_point" }, { level: "N5", type: "kanji" }] });
      expect(((await response.json()) as State).activeTracks).toEqual([
        { level: "N5", type: "kanji" },
        { level: "N3", type: "grammar_point" },
      ]);
      expect(await t.learningPath.activeTracks(t.learner)).toContainEqual({ level: "N4", type: "listening_clip" });
    });

    it("refuses a Track that does not exist, and a malformed body", async () => {
      expect((await t.send("PUT", "/tracks", { tracks: [{ level: "N9", type: "word" }] })).status).toBe(400);
      expect((await t.send("PUT", "/tracks", "not json")).status).toBe(400);
    });
  });

  describe("a batch", () => {
    it("comes from learning-path next(), with pulled-in dependencies on top of the batch size", async () => {
      await t.prefer({ batchSize: 3 });
      const { items } = await t.batch();
      const next = await t.learningPath.next(t.learner, 3);
      expect(next.length).toBeGreaterThanOrEqual(3);
      expect(items.map((i) => i.lesson.studyItemId)).toEqual(next);
    });

    it("is cut to what is left of today's budget", async () => {
      await t.prefer({ batchSize: 5, dailyBudget: 7 });
      const first = await t.batch();
      await t.send("POST", "/complete", { answers: first.items.map((i) => correct(i.prompt)) });
      const second = await t.batch();
      expect(second.remaining).toBe(7 - (await t.state()).learnedToday);
      expect(second.remaining).toBeLessThan(5);
      expect(second.items.map((i) => i.lesson.studyItemId)).toEqual(await t.learningPath.next(t.learner, second.remaining));
    });

    it("is empty once the budget is used up, and says nothing is left", async () => {
      await t.prefer({ batchSize: 2, dailyBudget: 2 });
      const { items } = await t.batch();
      await t.send("POST", "/complete", { answers: items.map((i) => correct(i.prompt)) });
      expect(await t.batch()).toMatchObject({ remaining: 0, items: [] });
    });

    it("does not count yesterday against today's budget", async () => {
      await t.prefer({ batchSize: 1, dailyBudget: 1 });
      const { items } = await t.batch();
      const at = new Date(NOW.getTime() - DAY_MS).toISOString();
      await t.progress.record({ learnerId: t.learner, studyItemId: items[0]!.lesson.studyItemId, kind: "learn", passed: true, at });
      expect((await t.batch()).items).toHaveLength(1);
    });

    it("teaches a Kanji, a Word and a Grammar Point, each with an Example", async () => {
      await t.prefer({ batchSize: 20, dailyBudget: 200 });
      const { items } = await t.batch();
      const lessonOf = (type: string) => items.find((i) => i.lesson.type === type)!.lesson;
      expect(lessonOf("kanji").reading).toBeNull();
      expect(lessonOf("kanji").meanings.length).toBeGreaterThan(0);
      expect(lessonOf("kanji").details.map((d) => d.label)).toContain("Strokes");
      expect(lessonOf("word").reading).toEqual(expect.any(String));
      expect(lessonOf("word").details[0]!.label).toBe("Part of speech");
      expect(lessonOf("grammar_point").details.map((d) => d.label)).toEqual(expect.arrayContaining(["Formation", "Register"]));
      for (const { lesson, prompt } of items) {
        expect(lesson.example.japanese).toBe(prompt.sentence.before + prompt.sentence.target + prompt.sentence.after);
        expect(prompt.japaneseExplanation).not.toBeNull();
      }
    });

    it("quizzes a Kanji on its reading and meaning, a Word and a Grammar Point as a cloze", async () => {
      await t.prefer({ batchSize: 20, dailyBudget: 200 });
      const { items } = await t.batch();
      for (const { prompt } of items) {
        expect(prompt.facets.map((f) => f.facet)).toEqual(prompt.type === "kanji" ? ["reading", "meaning"] : ["cloze"]);
        expect(prompt.mode).toBe(prompt.type === "kanji" ? "highlight" : "blank");
      }
    });

    it("leaves out Study Items that were learned or skipped", async () => {
      await t.prefer({ batchSize: 2 });
      const [one, two] = (await t.batch()).items;
      await t.send("POST", "/skip", { studyItemId: one!.lesson.studyItemId });
      await t.send("POST", "/complete", { answers: [correct(two!.prompt)] });
      const ids = (await t.batch()).items.map((i) => i.lesson.studyItemId);
      expect(ids).not.toContain(one!.lesson.studyItemId);
      expect(ids).not.toContain(two!.lesson.studyItemId);
    });

    it("sends the Learner's preferences", async () => {
      await t.prefer({ convertRomaji: false, explanations: "both" });
      expect((await t.batch()).preferences).toEqual({ convertRomaji: false, explanations: "both" });
    });

    it("leaves out a Study Item with no approved Example", async () => {
      let bareId: StudyItemId | undefined;
      const bare = await setup((graph) => {
        bareId = StudyItemId.parse(graph.studyItem.find((s) => s.type === "kanji")!.id);
        graph.example = graph.example.filter((e) => e.studyItemId !== bareId);
      });
      await bare.prefer({ batchSize: 20, dailyBudget: 200 });
      expect((await bare.batch()).items.map((i) => i.lesson.studyItemId)).not.toContain(bareId);
    });
  });

  describe("passing the quiz", () => {
    const quiz = async () => {
      await t.prefer({ batchSize: 3 });
      return (await t.batch()).items.map((i) => i.prompt);
    };

    it("re-grades every answer and records a learn Review with its Example, facets and tries", async () => {
      const prompts = await quiz();
      const answers = prompts.map(correct);
      answers[0]!.facets[0]!.attempts = ["ちがう"];
      answers[0]!.timeToAnswerMs = 3100;
      const response = await t.send("POST", "/complete", { answers });
      expect(await response.json()).toEqual({ recorded: prompts.length });
      const [review] = await t.progress.log(t.learner, prompts[0]!.studyItemId);
      expect(review).toMatchObject({
        kind: "learn",
        passed: true,
        at: NOW.toISOString(),
        exampleId: prompts[0]!.exampleId,
        timeToAnswerMs: 3100,
        attempts: [{ facet: prompts[0]!.facets[0]!.facet, input: "ちがう" }],
      });
      expect(review!.facets[0]).toMatchObject({ outcome: "pass", rawInput: answerFor(prompts[0]!.facets[0]!) });
      expect(review!.facets[0]!.matchedAnswerId).toBeDefined();
    });

    it("puts the items into Reviews: introduced, learning and due later", async () => {
      const prompts = await quiz();
      await t.send("POST", "/complete", { answers: prompts.map(correct) });
      for (const p of prompts) {
        expect(await t.progress.item(t.learner, p.studyItemId)).toMatchObject({ introduced: true, mastery: "learning", known: false });
      }
      const later = new Date(NOW.getTime() + 7 * DAY_MS);
      expect((await t.progress.due(t.learner, later)).sort()).toEqual(prompts.map((p) => p.studyItemId).sort());
    });

    it("refuses a forged pass and records nothing, not even for the answers that are right", async () => {
      const answers = (await quiz()).map(correct);
      answers[2]!.facets[0]!.input = "ちがう";
      expect((await t.send("POST", "/complete", { answers })).status).toBe(422);
      expect(await t.progress.log(t.learner)).toEqual([]);
    });

    it("refuses an input that is not an answer", async () => {
      const answers = (await quiz()).map(correct);
      answers[0]!.facets[0]!.input = "";
      expect((await t.send("POST", "/complete", { answers })).status).toBe(422);
    });

    it("passes a Kanji only when both facets are right, and refuses an answer that leaves one out", async () => {
      await t.prefer({ batchSize: 20, dailyBudget: 200 });
      const kanji = (await t.batch()).items.find((i) => i.prompt.type === "kanji")!.prompt;
      const wrong = correct(kanji);
      wrong.facets[1]!.input = "zzzzzz";
      expect((await t.send("POST", "/complete", { answers: [wrong] })).status).toBe(422);
      const partial = correct(kanji);
      partial.facets = partial.facets.slice(0, 1);
      expect((await t.send("POST", "/complete", { answers: [partial] })).status).toBe(422);
      expect((await t.send("POST", "/complete", { answers: [correct(kanji)] })).status).toBe(200);
    });

    it("refuses an Example that is not the Study Item's, and a malformed body", async () => {
      const [prompt] = await quiz();
      expect((await t.send("POST", "/complete", { answers: [{ ...correct(prompt!), exampleId: "nope" }] })).status).toBe(404);
      expect((await t.send("POST", "/complete", { answers: [] })).status).toBe(400);
      expect((await t.send("POST", "/complete", "not json")).status).toBe(400);
    });
  });

  describe("I know this", () => {
    const first = async () => (await t.batch()).items[0]!.lesson.studyItemId;

    it("records a manual Review from Learn, which makes the item Known and introduced", async () => {
      const id = await first();
      expect((await t.send("POST", "/skip", { studyItemId: id })).status).toBe(200);
      expect((await t.progress.log(t.learner, id)).at(-1)).toMatchObject({ kind: "manual", passed: true, source: "learn-skip", at: NOW.toISOString() });
      expect(await t.progress.item(t.learner, id)).toMatchObject({ known: true, introduced: true });
    });

    it("uses up a place in today's budget", async () => {
      await t.prefer({ dailyBudget: 4 });
      await t.send("POST", "/skip", { studyItemId: await first() });
      expect((await t.state()).learnedToday).toBe(1);
      expect((await t.batch()).remaining).toBe(3);
    });

    it("refuses a Study Item that does not exist, and a malformed body", async () => {
      const missing = StudyItemId.parse("00000000-0000-4000-8000-000000000999");
      expect((await t.send("POST", "/skip", { studyItemId: missing })).status).toBe(404);
      expect((await t.send("POST", "/skip", { studyItemId: "nope" })).status).toBe(400);
    });
  });
});
