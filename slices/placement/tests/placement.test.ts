import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver, type LearnerSession } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId } from "@mojibun/shared";
import { PlacementList, PlacementResult } from "../contract.ts";
import { createPlacementApi } from "../server/routes.ts";

const learner: LearnerSession = { learnerId: LearnerId.parse("4f1c2a3e-0000-4000-8000-000000000001"), role: "learner" };
const NOW = new Date("2026-11-06T09:00:00Z");

const setup = () => {
  const { graph, ids } = n5Fixture();
  const sessions = createFakeSessionResolver();
  const progress = createFakeProgress();
  const api = createPlacementApi({
    graph: createFakeContentGraph(graph),
    progress,
    sessions,
    transact: (work) => work(),
    now: () => NOW,
  });
  const headers = sessions.signIn(learner);
  const get = async (level: string) => api.request(`/${level}`, { headers });
  const post = async (level: string, body: unknown) =>
    api.request(`/${level}`, { method: "POST", headers: new Headers({ ...Object.fromEntries(headers), "content-type": "application/json" }), body: JSON.stringify(body) });
  return { api, ids, progress, get, post };
};

const list = async (res: Response) => PlacementList.parse(await res.json());

describe("placement", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("answers 401 without a session", async () => {
    expect((await s.api.request("/N5")).status).toBe(401);
    expect((await s.api.request("/N5", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("lists the kanji, words and grammar points of a level, none of them Known yet", async () => {
    const body = await list(await s.get("N5"));
    expect(body.level).toBe("N5");
    expect(new Set(body.items.map((i) => i.type))).toEqual(new Set(["kanji", "word", "grammar_point"]));
    expect(body.items).toHaveLength(30);
    expect(body.items.some((i) => i.known)).toBe(false);
  });

  it("lists nothing for a level with no content", async () => {
    expect((await list(await s.get("N1"))).items).toEqual([]);
  });

  it("answers 404 for a level that does not exist", async () => {
    expect((await s.get("N9")).status).toBe(404);
  });

  it("makes ticked items Known through manual Reviews, and shows them Known afterwards", async () => {
    const [a, b] = [s.ids.kanji["日"]!, s.ids.words["日本"]!];
    const res = await s.post("N5", { studyItemIds: [a, b] });
    expect(PlacementResult.parse(await res.json())).toEqual({ recorded: 2 });

    const log = await s.progress.log(learner.learnerId);
    expect(log).toEqual([
      expect.objectContaining({ studyItemId: a, kind: "manual", passed: true, source: "placement", at: NOW.toISOString() }),
      expect.objectContaining({ studyItemId: b, kind: "manual", passed: true, source: "placement", at: NOW.toISOString() }),
    ]);
    const known = (await list(await s.get("N5"))).items.filter((i) => i.known).map((i) => i.id);
    expect(known.sort()).toEqual([a, b].sort());
  });

  it("leaves a placed item to be checked by a later Review", async () => {
    const id = s.ids.kanji["日"]!;
    await s.post("N5", { studyItemIds: [id] });
    const item = await s.progress.item(learner.learnerId, id);
    expect(item).toMatchObject({ known: true, introduced: true, mastery: "young" });
    expect(item.due!.getTime()).toBeGreaterThan(NOW.getTime());
    const later = new Date(item.due!.getTime() + 1000);
    expect(await s.progress.due(learner.learnerId, later)).toEqual([id]);
  });

  it("records an item once however often it is ticked", async () => {
    const id = s.ids.kanji["日"]!;
    await s.post("N5", { studyItemIds: [id, id] });
    expect(PlacementResult.parse(await (await s.post("N5", { studyItemIds: [id] })).json())).toEqual({ recorded: 0 });
    expect(await s.progress.log(learner.learnerId)).toHaveLength(1);
  });

  it("refuses ticks for an item that is not on the level, and records none of the batch", async () => {
    const res = await s.post("N4", { studyItemIds: [s.ids.kanji["日"]!] });
    expect(res.status).toBe(400);
    expect(await s.progress.log(learner.learnerId)).toEqual([]);
  });

  it("refuses an empty or malformed submission", async () => {
    expect((await s.post("N5", { studyItemIds: [] })).status).toBe(400);
    expect((await s.post("N5", { studyItemIds: ["not-an-id"] })).status).toBe(400);
    expect((await s.post("N5", null)).status).toBe(400);
  });
});
