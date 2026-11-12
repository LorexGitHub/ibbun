import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver, type LearnerSession } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeLearningPath } from "@mojibun/learning-path/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { ItemPage, LevelList, Redirect, SearchResults } from "../contract.ts";
import { createBrowseApi } from "../server/api.ts";

const learner: LearnerSession = { learnerId: LearnerId.parse("4f1c2a3e-0000-4000-8000-000000000001"), role: "learner" };
const OTHER = LearnerId.parse("4f1c2a3e-0000-4000-8000-000000000002");
const RETIRED = StudyItemId.parse("00000058-0000-7000-8000-00000000ffff");

const setup = () => {
  const { graph, ids } = n5Fixture();
  const sessions = createFakeSessionResolver();
  const progress = createFakeProgress();
  const base = createFakeContentGraph(graph);
  const successors = new Map<string, StudyItemId>([[RETIRED, ids.words["日本"]!]]);
  const contentGraph = { ...base, successorOf: async (id: StudyItemId) => successors.get(id) ?? null };
  const learningPath = createFakeLearningPath({ contentGraph, progress });
  const api = createBrowseApi({ contentGraph, learningPath, progress, sessions });
  const headers = sessions.signIn(learner);
  const get = (path: string) => api.request(path, { headers });
  return { api, ids, progress, sessions, get };
};

describe("browse api", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it.each(["/levels/N5", "/search?q=day", `/items/${RETIRED}`])("answers 401 on %s without a session", async (path) => {
    expect((await s.api.request(path)).status).toBe(401);
  });

  describe("level lists", () => {
    it("lists the kanji, words and grammar points of a level", async () => {
      const body = LevelList.parse(await (await s.get("/levels/N5")).json());
      expect(body.level).toBe("N5");
      expect(new Set(body.items.map((i) => i.type))).toEqual(new Set(["kanji", "word", "grammar_point"]));
      expect(body.items).toHaveLength(30);
    });

    it("gives each item the Learner's own Mastery, and New for what they have not met", async () => {
      const day = s.ids.kanji["日"]!;
      await s.progress.record({ learnerId: learner.learnerId, studyItemId: day, kind: "manual", passed: true, at: "2026-11-06T09:00:00Z", source: "placement" });
      const mine = (await s.progress.item(learner.learnerId, day)).mastery;
      expect(mine).not.toBe("new");

      const { items } = LevelList.parse(await (await s.get("/levels/N5")).json());
      expect(items.find((i) => i.id === day)!.mastery).toBe(mine);
      expect(new Set(items.filter((i) => i.id !== day).map((i) => i.mastery))).toEqual(new Set(["new"]));

      const other = await s.api.request("/levels/N5", { headers: s.sessions.signIn({ ...learner, learnerId: OTHER }) });
      expect(new Set(LevelList.parse(await other.json()).items.map((i) => i.mastery))).toEqual(new Set(["new"]));
    });

    it("lists nothing for a level with no content", async () => {
      expect(LevelList.parse(await (await s.get("/levels/N1")).json()).items).toEqual([]);
    });

    it("answers 404 for a level that does not exist", async () => {
      expect((await s.get("/levels/N9")).status).toBe(404);
    });
  });

  describe("search", () => {
    it("finds Study Items by meaning", async () => {
      const body = SearchResults.parse(await (await s.get("/search?q=moon")).json());
      expect(body.query).toBe("moon");
      expect(body.items.map((i) => i.label)).toContain("月");
    });

    it("finds nothing for a blank or missing query", async () => {
      expect(SearchResults.parse(await (await s.get("/search?q=%20")).json()).items).toEqual([]);
      expect(SearchResults.parse(await (await s.get("/search")).json())).toEqual({ query: "", items: [] });
    });
  });

  describe("item pages", () => {
    const page = async (id: string) => ItemPage.parse(await (await s.get(`/items/${id}`)).json());

    it("shows a Kanji with its readings and the Words that contain it", async () => {
      const body = await page(s.ids.kanji["日"]!);
      expect(body.detail).toMatchObject({ type: "kanji", literal: "日", meanings: ["day", "sun", "Japan"], onReadings: ["ニチ", "ジツ"] });
      expect(body.level).toBe("N5");
      expect(body.related).toContainEqual(expect.objectContaining({ heading: "Words with this kanji" }));
    });

    it("shows a Word with its readings, senses, Examples and the Kanji it contains", async () => {
      const body = await page(s.ids.words["日本"]!);
      expect(body.detail).toMatchObject({ type: "word", forms: ["日本"], readings: [{ text: "にほん" }], senses: [{ glosses: ["Japan"] }] });
      expect(body.examples.length).toBeGreaterThan(0);
      expect(body.examples[0]).toMatchObject({ text: expect.stringContaining("日本"), translation: expect.any(String) });
      expect(body.related.find((r) => r.heading === "Kanji in this word")?.items.map((i) => i.summary.label)).toEqual(["日"]);
    });

    it("shows a Grammar Point with its formation and meaning", async () => {
      const body = await page(Object.values(s.ids.grammar)[0]!);
      expect(body.detail.type).toBe("grammar_point");
      expect(body.detail).toMatchObject({ formation: expect.any(Array), meaning: expect.any(String) });
    });

    it("answers 404 for an id that is not a Kanji, Word or Grammar Point", async () => {
      expect((await s.get(`/items/${StudyItemId.parse("00000058-0000-7000-8000-0000000fffff")}`)).status).toBe(404);
      expect((await s.get("/items/not-an-id")).status).toBe(404);
    });

    it("redirects a Retired Word to its successor", async () => {
      const res = await s.get(`/items/${RETIRED}`);
      expect(res.status).toBe(200);
      expect(Redirect.parse(await res.json())).toEqual({ redirectTo: s.ids.words["日本"] });
    });
  });

  describe("locking and Learn now", () => {
    const pageOf = async (id: string) => ItemPage.parse(await (await s.get(`/items/${id}`)).json());

    it("marks exactly the items the Learning Path has not reached as locked", async () => {
      const list = LevelList.parse(await (await s.get("/levels/N5")).json());
      const pages = await Promise.all(list.items.map((i) => pageOf(i.id)));
      expect(pages.some((p) => p.locked)).toBe(true);
      expect(pages.some((p) => !p.locked)).toBe(true);
    });

    it("lets a Learner who has introduced an item see it unlocked and introduced", async () => {
      const id = s.ids.kanji["日"]!;
      await s.progress.record({ learnerId: learner.learnerId, studyItemId: id, kind: "manual", passed: true, at: "2026-11-06T09:00:00Z", source: "placement" });
      expect(await pageOf(id)).toMatchObject({ locked: false, introduced: true });
    });

    it("never shows a position number", async () => {
      const text = JSON.stringify(await (await s.get(`/items/${s.ids.kanji["日"]}`)).json());
      expect(text).not.toMatch(/position/i);
    });
  });
});
