import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createFakeContentGraph, n5Fixture } from "@ibbun/content-graph/testing";
import { createFakeProgress } from "@ibbun/progress/testing";
import { LearnerId, StudyItemId } from "@ibbun/shared";
import { LevelPage, Today } from "../contract.ts";
import { createDashboardApi } from "./api.ts";

const { graph, ids } = n5Fixture();
const mine = LearnerId.parse("00000000-0000-7000-8000-0000000000aa");
const NOW = new Date("2026-03-10T18:00:00Z");

const setup = () => {
  const sessions = createFakeSessionResolver();
  const progress = createFakeProgress();
  const deps = { sessions, progress, contentGraph: createFakeContentGraph(graph), batchSize: async () => 5, now: () => NOW };
  const api = createDashboardApi(deps);
  return { api, sessions, progress };
};

describe("GET /today", () => {
  it("refuses a request without a session", async () => {
    const { api } = setup();
    expect((await api.request("/today")).status).toBe(401);
  });

  it("answers the logged-in Learner's own Today", async () => {
    const { api, sessions, progress } = setup();
    const kanji = Object.values(ids.kanji)[0]!;
    await progress.record({ learnerId: mine, studyItemId: StudyItemId.parse(kanji), kind: "manual", passed: true, at: "2026-03-01T09:00:00Z" });
    const headers = sessions.signIn({ learnerId: mine, role: "learner" });
    const response = await api.request("/today", { headers });
    expect(response.status).toBe(200);
    const today = Today.parse(await response.json());
    expect(today.due).toEqual({ total: 1, kanji: 1, word: 0, grammarPoint: 0 });
    expect(today.levels[0]).toEqual({ level: "N5", total: 30, known: 1 });
  });

  it("shows another Learner nothing of theirs", async () => {
    const { api, sessions, progress } = setup();
    await progress.record({ learnerId: mine, studyItemId: StudyItemId.parse(Object.values(ids.kanji)[0]!), kind: "manual", passed: true, at: "2026-03-01T09:00:00Z" });
    const headers = sessions.signIn({ learnerId: LearnerId.parse("00000000-0000-7000-8000-0000000000bb"), role: "learner" });
    const today = Today.parse(await (await api.request("/today", { headers })).json());
    expect(today.due.total).toBe(0);
  });
});

describe("GET /levels/:level", () => {
  it("refuses a request without a session", async () => {
    const { api } = setup();
    expect((await api.request("/levels/n5")).status).toBe(401);
  });

  it("answers one JLPT Level for the logged-in Learner, whatever the case of its name", async () => {
    const { api, sessions, progress } = setup();
    await progress.record({ learnerId: mine, studyItemId: StudyItemId.parse(Object.values(ids.kanji)[0]!), kind: "manual", passed: true, at: "2026-03-01T09:00:00Z" });
    const headers = sessions.signIn({ learnerId: mine, role: "learner" });
    for (const name of ["n5", "N5"]) {
      const response = await api.request(`/levels/${name}`, { headers });
      expect(response.status).toBe(200);
      const page = LevelPage.parse(await response.json());
      expect(page.level).toBe("N5");
      expect(page.kanji.known).toBe(1);
      expect(page.due).toBe(1);
    }
  });

  it("answers 404 for a level that does not exist", async () => {
    const { api, sessions } = setup();
    const response = await api.request("/levels/n6", { headers: sessions.signIn({ learnerId: mine, role: "learner" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "unknown JLPT Level" });
  });
});
