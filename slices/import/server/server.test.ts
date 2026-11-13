import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { migrateContentGraph } from "@ibbun/content-graph/testing";
import { collectMigrations, createDb, migrate, transaction, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { createFakeJobs } from "@ibbun/jobs";
import type { Nlp } from "@ibbun/nlp";
import { LearnerId } from "@ibbun/shared";
import { checkSlices } from "@ibbun/slice";
import slice from "../register.ts";
import { createImportServer } from "./import-server.ts";
import type { GrammarSources } from "../sources/grammar-seed/download.ts";
import type { GrammarSeedDeps } from "../sources/grammar-seed/index.ts";
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
    expect(slice.nav).toMatchObject({ label: "Import", path: "/admin/import", place: "supervisor" });
  });

  it("always runs the staleness check, and refreshes nothing when no source is given", () => {
    const part = createImportServer({ db, sessions: createFakeSessionResolver() }, { rawDir: dir, refreshes: [] });
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
    const part = createImportServer({ db, sessions }, { rawDir: dir, refreshes: [refresh] });
    const jobs = createFakeJobs();
    await jobs.work(part.jobs!);
    for (const { contract, schedule } of part.jobs!) await jobs.schedule(contract, schedule!.cron, schedule!.payload);

    await jobs.fire("import.jmdict");
    await jobs.drain();

    const supervisor = sessions.signIn({ learnerId: LearnerId.parse(randomUUID()), role: "supervisor" });
    const { runs } = (await (await part.api!.request("/runs", { headers: supervisor })).json()) as { runs: { status: string; upstreamVersion: string; counts: { added: number } }[] };
    expect(runs).toMatchObject([{ status: "applied", upstreamVersion: "3.6.2+1", counts: { added: 1 } }]);
  });

  it("runs the one-time Grammar Point seed as a job with no schedule, into Postgres, and a second run adds nothing", async () => {
    const nlp: Nlp = { tokenize: async (text) => [{ surface: text, lemma: text, reading: text, partOfSpeech: ["名詞"], conjugation: null }] };
    const sources: GrammarSources = {
      hanabiraCommit: "abc",
      tanosSnapshot: "2020",
      hanabira: [{ key: "N5:0", level: "N5", title: "ます", meaning: "polite", notes: "long", formation: ["V-ます"], examples: [{ text: "食べます。", translationEn: "I eat." }] }],
      tanos: [{ key: "1", level: "N5", title: "ます" }],
    };
    const deps: GrammarSeedDeps = {
      nlp,
      jobs: createFakeJobs(),
      authoring: createAuthoring(db),
      transact: (work) => transaction(db, (tx) => work(createAuthoring(tx))),
      download: async () => sources,
    };
    const part = createImportServer({ db, sessions: createFakeSessionResolver() }, { rawDir: dir, refreshes: [], grammarSeed: () => deps });
    expect(part.jobs?.map((j) => [j.contract.name, j.schedule])).toEqual([["import.staleness", expect.anything()], ["import.grammar-seed", undefined]]);

    const jobs = createFakeJobs();
    await jobs.work(part.jobs!);
    await jobs.enqueue(part.jobs![1]!.contract, {});
    await jobs.enqueue(part.jobs![1]!.contract, {});
    await jobs.drain();

    const auth = createAuthoring(db);
    expect((await auth.rows("grammarPoint")).map((p) => p.title)).toEqual(["ます", "ます"]);
    expect(await auth.rows("sentence")).toHaveLength(1);
    expect(await auth.rows("sentenceDemonstratesGrammar")).toMatchObject([{ approval: "draft", spanStart: 0, spanEnd: 5 }]);
    expect(await auth.rows("generationRequest")).toMatchObject([{ kind: "merge_proposal", status: "open" }]);
  });
});
