import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectMigrations, createDb, migrate, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { createPostgresStore } from "./postgres.ts";
import { createMemoryStore } from "./store.ts";
import { freshState, type Sample, type SamplingStore } from "./types.ts";

const sample = (over: Partial<Sample> = {}): Sample => {
  const id = randomUUID();
  return {
    id,
    kind: "example",
    reason: "random",
    status: "pending",
    primary: { table: "example", id },
    unit: [{ table: "sentence", id: randomUUID() }, { table: "example", id }],
    decisionId: null,
    requestId: null,
    model: "opus",
    rubricVersion: "v1",
    note: null,
    at: new Date("2026-11-07T10:00:00Z"),
    settledAt: null,
    ...over,
  };
};

const storeContract = (make: () => Promise<SamplingStore>) => {
  it("starts every kind fresh and keeps the state it is given", async () => {
    const store = await make();
    expect(await store.state("example")).toEqual(freshState("example"));
    const next = { kind: "example" as const, version: "opus/v1", calibrationLeft: 19, paused: true, resumedAt: new Date("2026-11-07T11:00:00Z"), cursor: new Date("2026-11-07T11:30:00Z") };
    await store.saveState(next);
    await store.saveState({ ...next, calibrationLeft: 3 });
    expect(await store.state("example")).toEqual({ ...next, calibrationLeft: 3 });
    expect(await store.state("japanese-explanation")).toEqual(freshState("japanese-explanation"));
  });

  it("keeps samples, lists them oldest first by status and kind, and settles them", async () => {
    const store = await make();
    const late = sample({ at: new Date("2026-11-07T12:00:00Z") });
    const early = sample();
    const other = sample({ kind: "japanese-explanation", primary: { table: "japaneseExplanation", id: randomUUID() } });
    for (const s of [late, early, other]) await store.add(s);
    expect(await store.get(early.id)).toEqual(early);
    expect(await store.get(randomUUID())).toBeUndefined();
    expect((await store.list()).map((s) => s.id)).toEqual([early.id, other.id, late.id]);
    expect((await store.list({ kind: "example" })).map((s) => s.id)).toEqual([early.id, late.id]);

    const at = new Date("2026-11-07T13:00:00Z");
    await store.settle(early.id, "rejected", "wrong sense", at);
    expect(await store.get(early.id)).toEqual({ ...early, status: "rejected", note: "wrong sense", settledAt: at });
    expect((await store.list({ status: "pending" })).map((s) => s.id)).toEqual([other.id, late.id]);
    expect((await store.list({ status: "rejected", kind: "example" })).map((s) => s.id)).toEqual([early.id]);
  });
};

describe("sampling store, memory", () => {
  storeContract(async () => createMemoryStore());
});

describe("sampling store, Postgres", () => {
  const ref = {} as { db: Db; pg: TestPostgres };
  beforeAll(async () => {
    ref.pg = await startTestPostgres();
    ref.db = createDb(ref.pg.url, { max: 1 });
    await migrate(ref.db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
  }, 60_000);
  afterAll(async () => {
    await ref.db.$client.end();
    await ref.pg.stop();
  });
  storeContract(async () => {
    await ref.db.$client.query("TRUNCATE content_approval.sample, content_approval.kind_state");
    return createPostgresStore(ref.db);
  });
});
