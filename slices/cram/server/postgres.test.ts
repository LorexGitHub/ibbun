import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createContentGraph } from "@mojibun/content-graph";
import { migrateContentGraph, n5Fixture, seedContentGraph } from "@mojibun/content-graph/testing";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { createProgress } from "@mojibun/progress";
import { migrateProgress } from "@mojibun/progress/testing";
import { LearnerId } from "@mojibun/shared";
import { createCramApi } from "./api.ts";
import type { Question, Verdict } from "../contract.ts";

const learnerId = LearnerId.parse("00000000-0000-4000-8000-0000000000b1");
const { graph, ids } = n5Fixture();
let pg: TestPostgres;
let db: Db;

beforeAll(async () => {
  pg = await startTestPostgres();
  db = createDb(pg.url, { max: 1 });
  await migrateContentGraph(db);
  await migrateProgress(db);
  await seedContentGraph(db, graph);
}, 60_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("Cram against the real Postgres stores", () => {
  it("practises a locked, never-learned Word and logs a `cram` Review that leaves Mastery and the schedule alone", async () => {
    const sessions = createFakeSessionResolver();
    const progress = createProgress(db);
    const headers = sessions.signIn({ learnerId, role: "learner" });
    const app = createCramApi(async () => ({ contentGraph: createContentGraph(db), progress, sessions, now: () => new Date("2026-11-06T09:00:00.000Z") }));
    const call = (path: string, body?: object) =>
      app.request(path, { method: body ? "POST" : "GET", headers: new Headers({ ...Object.fromEntries(headers), "content-type": "application/json" }), body: body ? JSON.stringify(body) : undefined });

    const words = await (await call("/items?level=N5&type=word")).json();
    expect(words.map((w: { id: string }) => w.id)).toContain(ids.words["山"]);

    const q = (await (await call(`/items/${ids.words["山"]}/question`)).json()) as Question;
    const verdict = (await (await call("/answers", { studyItemId: q.studyItemId, exampleId: q.exampleId, facets: [{ facet: "japanese", input: "やま" }] })).json()) as Verdict;
    expect(verdict).toMatchObject({ status: "graded", passed: true });

    expect(await progress.log(learnerId)).toMatchObject([{ kind: "cram", passed: true, studyItemId: ids.words["山"], exampleId: q.exampleId }]);
    expect(await progress.item(learnerId, ids.words["山"]!)).toMatchObject({ mastery: "new", known: false, introduced: false, due: null });
    expect(await progress.items(learnerId)).toEqual([]);
  });
});
