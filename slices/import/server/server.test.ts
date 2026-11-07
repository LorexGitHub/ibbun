import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { migrateContentGraph } from "@mojibun/content-graph/testing";
import { collectMigrations, createDb, migrate, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { createFakeJobs } from "@mojibun/jobs";
import { LearnerId } from "@mojibun/shared";
import { checkSlices } from "@mojibun/slice";
import slice from "../register.ts";
import { createImportServer } from "./index.ts";
import type { Refresh } from "./jobs.ts";

describe("the import slice, registered", () => {
  let pg: TestPostgres;
  let db: Db;
  let dir: string;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
    await migrate(db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
    dir = await mkdtemp(join(tmpdir(), "import-slice-"));
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("is a slice named import with a nav entry for the report screen", () => {
    expect(checkSlices([slice]).map((s) => s.name)).toEqual(["import"]);
    expect(slice.nav).toEqual({ label: "Import", path: "/admin/import" });
  });

  it("offers nothing to run without a database, and no API without a session resolver", async () => {
    expect(await slice.server!({})).toEqual({});
    const part = createImportServer({ databaseUrl: pg.url }, { db, rawDir: dir, refreshes: [] });
    expect(part.api).toBeUndefined();
    expect(part.jobs?.map((j) => j.contract.name)).toEqual(["import.staleness"]);
  });

  it("starts a scheduled refresh on its own, imports through Postgres and shows the run to the supervisor", async () => {
    const refresh: Refresh = {
      cron: "0 12 * * *",
      monthly: false,
      source: {
        dataset: "jmdict",
        latest: async () => "3.6.2+1",
        download: async () => [{ name: "f", bytes: new Uint8Array() }],
        parse: () => [{ key: "1", forms: ["食べる"], readings: [{ text: "たべる", pitchAccent: null }], senses: [{ partsOfSpeech: ["v1"], glosses: ["to eat"] }], priorityTags: [] }],
      },
    };
    const sessions = createFakeSessionResolver();
    const part = createImportServer({ databaseUrl: pg.url, sessions }, { db, rawDir: dir, refreshes: [refresh] });
    const jobs = createFakeJobs();
    await jobs.work(part.jobs!);
    for (const s of part.schedules!) await jobs.schedule(s.contract, s.cron, s.payload);

    await jobs.fire("import.jmdict");
    await jobs.drain();

    const supervisor = sessions.signIn({ learnerId: LearnerId.parse(randomUUID()), role: "supervisor" });
    const { runs } = (await (await part.api!.request("/runs", { headers: supervisor })).json()) as { runs: { status: string; upstreamVersion: string; counts: { added: number } }[] };
    expect(runs).toMatchObject([{ status: "applied", upstreamVersion: "3.6.2+1", counts: { added: 1 } }]);
  });
});
