import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createFakeContentGraph, n5Fixture } from "@ibbun/content-graph/testing";
import { createFakeProgress } from "@ibbun/progress/testing";
import { LearnerId } from "@ibbun/shared";
import { createCramApi } from "./api.ts";
import type { Question, Verdict } from "../contract.ts";

const { graph, ids } = n5Fixture();
const learnerId = LearnerId.parse("00000000-0000-4000-8000-0000000000a1");
const NOW = new Date("2026-11-06T09:00:00.000Z");

let sessions: ReturnType<typeof createFakeSessionResolver>;
let progress: ReturnType<typeof createFakeProgress>;
let headers: Headers;
let app: ReturnType<typeof createCramApi>;

const depsWith = (g: typeof graph) => ({ contentGraph: createFakeContentGraph(g), progress, sessions, now: () => NOW });

beforeEach(() => {
  sessions = createFakeSessionResolver();
  progress = createFakeProgress();
  headers = sessions.signIn({ learnerId, role: "learner" });
  app = createCramApi(depsWith(structuredClone(graph)));
});

const get = (path: string, as: Headers | null = headers) => app.request(path, { headers: as ?? undefined });
const post = (path: string, body: unknown, as: Headers | null = headers) =>
  app.request(path, {
    method: "POST",
    headers: new Headers({ ...Object.fromEntries(as ?? []), "content-type": "application/json" }),
    body: JSON.stringify(body),
  });

const question = async (id: string, after?: string): Promise<Question> =>
  (await get(`/items/${id}/question${after ? `?after=${after}` : ""}`)).json();

describe("who may use Cram", () => {
  it.each(["/items?level=N5", `/items/${ids.words["山"]}/question`])("refuses %s without a session", async (path) => {
    expect((await get(path, null)).status).toBe(401);
  });

  it("refuses an answer without a session", async () => {
    expect((await post("/answers", {}, null)).status).toBe(401);
  });
});

describe("GET /items", () => {
  it("lists a level's Study Items of every Cram type, whatever the Learner has unlocked", async () => {
    const items = await (await get("/items?level=N5")).json();
    expect(new Set(items.map((i: { type: string }) => i.type))).toEqual(new Set(["kanji", "word", "grammar_point"]));
  });

  it("narrows a level to one type", async () => {
    const items = await (await get("/items?level=N5&type=kanji")).json();
    expect(items).toHaveLength(10);
    expect(items.every((i: { type: string }) => i.type === "kanji")).toBe(true);
  });

  it("searches by meaning", async () => {
    const items = await (await get("/items?q=mountain")).json();
    expect(items.map((i: { id: string }) => i.id)).toContain(ids.words["山"]);
  });

  it("answers 400 when it is given neither a search nor a level", async () => {
    expect((await get("/items")).status).toBe(400);
    expect((await get("/items?level=N9")).status).toBe(400);
  });
});

describe("GET /items/:id/question", () => {
  it("answers a question for a Study Item", async () => {
    const res = await get(`/items/${ids.words["山"]}/question`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ studyItemId: ids.words["山"], itemType: "word" });
  });

  it("rotates to another Example after the one the Learner just saw", async () => {
    const first = await question(ids.words["山"]!);
    expect((await question(ids.words["山"]!, first.exampleId)).exampleId).not.toBe(first.exampleId);
  });

  it("answers 404 for an unknown Study Item and for one with no approved Example", async () => {
    expect((await get("/items/00000000-0000-4000-8000-000000000000/question")).status).toBe(404);
    const bare = createCramApi(depsWith({ ...structuredClone(graph), example: [] }));
    expect((await bare.request(`/items/${ids.words["山"]}/question`, { headers })).status).toBe(404);
  });

  it("answers 400 for an id that is not a Study Item id", async () => {
    expect((await get("/items/nope/question")).status).toBe(400);
  });
});

describe("POST /answers", () => {
  const wordSubmission = async (input: string, extra: object = {}) => {
    const q = await question(ids.words["山"]!);
    return { studyItemId: q.studyItemId, exampleId: q.exampleId, facets: [{ facet: "japanese", input }], ...extra };
  };

  it("grades a right answer on the server and logs it as `cram` with the facet detail", async () => {
    const res = await post(
      "/answers",
      await wordSubmission("やま", { hintsOpened: ["hint"], timeToAnswerMs: 4200, attempts: [{ facet: "japanese", input: "" }] }),
    );
    expect(await res.json()).toEqual({
      status: "graded",
      passed: true,
      results: [{ facet: "japanese", outcome: "pass", matchedAnswerId: expect.any(String) }],
    });
    const [review] = await progress.log(learnerId);
    expect(review).toMatchObject({
      learnerId,
      studyItemId: ids.words["山"],
      kind: "cram",
      passed: true,
      at: NOW.toISOString(),
      hintsOpened: ["hint"],
      revealed: false,
      timeToAnswerMs: 4200,
      attempts: [{ facet: "japanese", input: "" }],
      facets: [{ facet: "japanese", rawInput: "やま", normalisedInput: "やま", outcome: "pass" }],
    });
  });

  it("logs a wrong answer as a failed `cram` Review", async () => {
    const body = (await (await post("/answers", await wordSubmission("かわ"))).json()) as Verdict;
    expect(body).toMatchObject({ status: "graded", passed: false });
    expect((await progress.log(learnerId))[0]).toMatchObject({ kind: "cram", passed: false, facets: [{ outcome: "fail" }] });
  });

  it("neither schedules the Study Item nor changes its Mastery, whatever the Learner answers", async () => {
    await post("/answers", await wordSubmission("やま"));
    await post("/answers", await wordSubmission("かわ"));
    const item = await progress.item(learnerId, ids.words["山"]!);
    expect(item).toMatchObject({ mastery: "new", known: false, introduced: false, due: null });
    expect(await progress.items(learnerId)).toEqual([]);
    expect(await progress.due(learnerId, new Date("2030-01-01"))).toEqual([]);
  });

  it("leaves a Study Item that is already being learned exactly as it was", async () => {
    const studyItemId = ids.words["山"]!;
    await progress.record({ learnerId, studyItemId, kind: "srs", passed: true, at: "2026-11-01T09:00:00.000Z" });
    const before = await progress.item(learnerId, studyItemId);
    await post("/answers", await wordSubmission("かわ"));
    await post("/answers", await wordSubmission("やま"));
    expect(await progress.item(learnerId, studyItemId)).toEqual(before);
  });

  it("asks again, logging nothing, when the answer is empty or has Latin letters", async () => {
    for (const input of ["", "yama?"]) {
      const body = (await (await post("/answers", await wordSubmission(input))).json()) as Verdict;
      expect(body).toMatchObject({ status: "retry", results: [{ outcome: "retry" }] });
    }
    expect(await progress.log(learnerId)).toEqual([]);
  });

  it("counts Show answer as a fail whatever was typed, and logs that it was revealed", async () => {
    const body = (await (await post("/answers", await wordSubmission("", { revealed: true }))).json()) as Verdict;
    expect(body).toMatchObject({ status: "graded", passed: false });
    expect((await progress.log(learnerId))[0]).toMatchObject({ passed: false, revealed: true, facets: [{ facet: "japanese", outcome: "fail" }] });
  });

  it("passes a Kanji only when both facets pass", async () => {
    const q = await question(ids.kanji["山"]!);
    const submit = (reading: string, meaning: string) =>
      post("/answers", {
        studyItemId: q.studyItemId,
        exampleId: q.exampleId,
        facets: [
          { facet: "japanese", input: reading },
          { facet: "meaning", input: meaning },
        ],
      });
    expect(await (await submit("やま", "mountain")).json()).toMatchObject({ passed: true });
    expect(await (await submit("やま", "river")).json()).toMatchObject({ passed: false });
    expect((await progress.log(learnerId)).map((r) => r.passed)).toEqual([true, false]);
  });

  it("rejects a submission whose facets are not the ones the Example asks", async () => {
    const q = await question(ids.kanji["山"]!);
    const missing = { studyItemId: q.studyItemId, exampleId: q.exampleId, facets: [{ facet: "japanese", input: "やま" }] };
    const unasked = { ...(await wordSubmission("やま")), facets: [{ facet: "meaning", input: "mountain" }] };
    const twice = {
      ...(await wordSubmission("やま")),
      facets: [
        { facet: "japanese", input: "やま" },
        { facet: "japanese", input: "やま" },
      ],
    };
    for (const body of [missing, unasked, twice]) expect((await post("/answers", body)).status).toBe(400);
    expect(await progress.log(learnerId)).toEqual([]);
  });

  it("rejects an Example that does not belong to the Study Item, and a malformed body", async () => {
    const other = await question(ids.words["川"]!);
    const body = { ...(await wordSubmission("やま")), exampleId: other.exampleId };
    expect((await post("/answers", body)).status).toBe(404);
    expect((await post("/answers", { nonsense: true })).status).toBe(400);
    expect((await app.request("/answers", { method: "POST", headers, body: "not json" })).status).toBe(400);
    expect(await progress.log(learnerId)).toEqual([]);
  });

  it("answers 404 when the Study Item does not exist", async () => {
    const body = { ...(await wordSubmission("やま")), studyItemId: "00000000-0000-4000-8000-000000000000" };
    expect((await post("/answers", body)).status).toBe(404);
  });
});

describe("GET /items with the Learner's Mastery", () => {
  type Listed = { id: string; mastery: string };
  const list = async (query: string): Promise<Listed[]> => (await get(`/items?${query}`)).json();
  const yama = ids.words["山"]!;
  const learn = () => progress.record({ learnerId, studyItemId: yama, kind: "learn", passed: true, at: "2026-11-01T09:00:00.000Z" });

  it("marks every item New for a Learner who has learned nothing", async () => {
    expect(new Set((await list("level=N5")).map((i) => i.mastery))).toEqual(new Set(["new"]));
  });

  it("puts the Learner's own Mastery on what they have learned, in a level and in a search", async () => {
    await learn();
    const mine = (await progress.item(learnerId, yama)).mastery;
    expect(mine).not.toBe("new");
    expect((await list("level=N5")).find((i) => i.id === yama)!.mastery).toBe(mine);
    expect((await list("q=mountain")).find((i) => i.id === yama)!.mastery).toBe(mine);
    const other = sessions.signIn({ learnerId: LearnerId.parse("00000000-0000-4000-8000-0000000000b2"), role: "learner" });
    const theirs: Listed[] = await (await get("/items?level=N5", other)).json();
    expect(theirs.find((i) => i.id === yama)!.mastery).toBe("new");
  });

  it("narrows to one Mastery", async () => {
    await learn();
    const mine = (await progress.item(learnerId, yama)).mastery;
    expect((await list(`level=N5&mastery=${mine}`)).map((i) => i.id)).toEqual([yama]);
    const fresh = await list("level=N5&mastery=new");
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.map((i) => i.id)).not.toContain(yama);
  });

  it("answers 400 for a Mastery it does not know", async () => {
    expect((await get("/items?level=N5&mastery=expert")).status).toBe(400);
  });
});
