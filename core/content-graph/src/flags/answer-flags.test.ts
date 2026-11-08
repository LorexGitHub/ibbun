import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { createAuthoring, type Authoring } from "../authoring/index.ts";
import { emptyGraph } from "../graph.ts";
import { createFakeAnswerFlags, createFakeAuthoring, migrateContentGraph } from "../testing.ts";
import { createAnswerFlags, type AnswerFlags } from "./index.ts";

type Harness = { flags: AnswerFlags; authoring: Authoring };

const contract = (make: () => Promise<Harness>) => {
  let h: Harness;
  beforeAll(async () => {
    h = await make();
  });
  const flag = () => ({ exampleId: randomUUID(), reviewId: randomUUID(), facet: "cloze", input: "みづ" });
  const openFor = async (exampleId: string) => (await h.authoring.queue({ reason: "answer flag" })).filter((e) => e.recordId === exampleId);

  it("queues an answer flag for the Example, with the Review, facet and input", async () => {
    const f = flag();
    await h.flags.flag(f);
    const [entry] = await openFor(f.exampleId);
    expect(entry).toMatchObject({ reason: "answer flag", recordId: f.exampleId, resolved: false, detail: { reviewId: f.reviewId, facet: "cloze", input: "みづ" } });
  });

  it("queues a Review facet once, however often it is flagged", async () => {
    const f = flag();
    await h.flags.flag(f);
    await h.flags.flag(f);
    expect(await openFor(f.exampleId)).toHaveLength(1);
  });

  it("queues each facet of a Review, and each Review of an Example, on its own", async () => {
    const f = flag();
    await h.flags.flag(f);
    await h.flags.flag({ ...f, facet: "reading" });
    await h.flags.flag({ ...f, reviewId: randomUUID() });
    expect(await openFor(f.exampleId)).toHaveLength(3);
  });

  it("does not queue a flag again after it was decided", async () => {
    const f = flag();
    await h.flags.flag(f);
    await h.authoring.resolve((await openFor(f.exampleId))[0]!.id);
    await h.flags.flag(f);
    expect(await openFor(f.exampleId)).toHaveLength(0);
  });
};

describe("answer flags, against the fake", () => {
  contract(async () => {
    const graph = emptyGraph();
    return { flags: createFakeAnswerFlags(graph), authoring: createFakeAuthoring(graph) };
  });
});

describe("answer flags, against Postgres", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });
  contract(async () => ({ flags: createAnswerFlags(db), authoring: createAuthoring(db) }));
});
