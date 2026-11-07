import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthoring, type Authoring, type WordRecord } from "@mojibun/content-graph/authoring";
import { createFakeAuthoring, emptyGraph, migrateContentGraph } from "@mojibun/content-graph/testing";
import { collectMigrations, createDb, migrate, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { diff } from "./diff.ts";
import { directoryRawFiles, memoryRawFiles, type RawFiles } from "./raw-files.ts";
import { runImport, type ImportDeps } from "./run.ts";
import type { RawFile, Source } from "./source.ts";
import { memorySnapshots, postgresSnapshots, type Snapshots } from "./snapshots.ts";

const word = (key: string, text: string, reading: string, gloss: string): WordRecord => ({
  key,
  forms: [text],
  readings: [{ text: reading, pitchAccent: null }],
  senses: [{ partsOfSpeech: ["v1"], glosses: [gloss] }],
  priorityTags: [],
});

/** An upstream whose newest release and contents the test controls, and which counts downloads. */
const fakeUpstream = () => {
  const state = { version: "v1", words: [] as WordRecord[], downloads: 0 };
  const source: Source<"jmdict"> = {
    dataset: "jmdict",
    latest: async () => state.version,
    download: async (version) => {
      state.downloads++;
      return [{ name: "jmdict.json", bytes: new TextEncoder().encode(JSON.stringify({ version, words: state.words })) }];
    },
    parse: (files: RawFile[]) => JSON.parse(new TextDecoder().decode(files[0]!.bytes)).words,
  };
  return { state, source };
};

type World = { deps: ImportDeps; authoring: Authoring; snapshots: Snapshots; raw: RawFiles };

const importContract = (name: string, make: () => Promise<World>) =>
  describe(name, () => {
    let w: World;
    beforeEach(async () => {
      w = await make();
    });

    const NEARLY_ALL = [word("1", "食べる", "たべる", "to eat"), word("2", "飲む", "のむ", "to drink"), word("3", "見る", "みる", "to see")];

    it("stages, diffs and applies a first run: every record added, a snapshot kept, a diff recorded", async () => {
      const { state, source } = fakeUpstream();
      state.words = NEARLY_ALL;
      const { report, diff: found, upstreamVersion } = await runImport(w.deps, source);

      expect(upstreamVersion).toBe("v1");
      expect(report.status).toBe("applied");
      expect(report.counts.added).toBe(3);
      expect(found).toEqual({ added: ["1", "2", "3"], changed: [], gone: [] });
      expect(await w.authoring.rows("word")).toHaveLength(3);
      expect((await w.snapshots.latest("jmdict"))?.records.map((r) => r.key).sort()).toEqual(["1", "2", "3"]);
      expect((await w.snapshots.diffs([report.importRunId])).get(report.importRunId)).toEqual({ added: 3, changed: 0, gone: 0 });
    });

    it("changes nothing on a rerun of the same upstream version, and downloads nothing", async () => {
      const { state, source } = fakeUpstream();
      state.words = NEARLY_ALL;
      const first = await runImport(w.deps, source);
      const rows = await w.authoring.rows("word");
      const runs = await w.authoring.rows("importRun");

      const again = await runImport(w.deps, source);

      expect(again.report.status).toBe("unchanged");
      expect(again.report.importRunId).toBe(first.report.importRunId);
      expect(state.downloads).toBe(1);
      expect(await w.authoring.rows("word")).toEqual(rows);
      expect(await w.authoring.rows("importRun")).toEqual(runs);
    });

    it("diffs the next version against the previous snapshot and keeps the snapshot current", async () => {
      const { state, source } = fakeUpstream();
      state.words = [...NEARLY_ALL, ...Array.from({ length: 997 }, (_, i) => word(`x${i}`, `語${i}`, `ご${i}`, `word ${i}`))];
      await runImport(w.deps, source);

      state.version = "v2";
      state.words = [word("1", "食べる", "たべる", "to eat or live on"), ...state.words.slice(1).filter((r) => r.key !== "2"), word("4", "聞く", "きく", "to hear")];
      const { report, diff: found } = await runImport(w.deps, source);

      expect(found).toEqual({ added: ["4"], changed: ["1"], gone: ["2"] });
      expect(report.status).toBe("applied");
      expect(report.counts).toMatchObject({ added: 1, changed: 1, retired: 1 });
      const snapshot = (await w.snapshots.latest("jmdict"))!;
      expect(snapshot.upstreamVersion).toBe("v2");
      expect(diff(snapshot.records, state.words)).toEqual({ added: [], changed: [], gone: [] });
    });

    it("applies nothing and keeps the old snapshot when the circuit breaker trips, then applies on release without downloading again", async () => {
      const { state, source } = fakeUpstream();
      state.words = NEARLY_ALL;
      await runImport(w.deps, source);

      state.version = "v2";
      state.words = [word("1", "食べる", "たべる", "to chew")];
      const held = await runImport(w.deps, source);

      expect(held.report.status).toBe("breaker tripped");
      expect(await w.authoring.queue({ importRunId: held.report.importRunId })).toMatchObject([{ reason: "breaker tripped" }]);
      expect((await w.snapshots.latest("jmdict"))?.upstreamVersion).toBe("v1");
      expect((await w.authoring.rows("studyItem")).every((i) => !i.retired)).toBe(true);
      expect(state.downloads).toBe(2);

      const again = await runImport(w.deps, source);
      expect(again.report).toMatchObject({ status: "breaker tripped", importRunId: held.report.importRunId });
      expect(await w.authoring.queue({ reason: "breaker tripped" })).toHaveLength(1);
      expect(await w.authoring.rows("importRun")).toHaveLength(2);

      const released = await runImport(w.deps, source, { release: true });

      expect(released.report.status).toBe("applied");
      expect(state.downloads).toBe(2);
      expect((await w.snapshots.latest("jmdict"))?.upstreamVersion).toBe("v2");
      expect((await w.authoring.rows("studyItem")).filter((i) => i.retired)).toHaveLength(2);
    });

    it("finishes the snapshot of a version that applied but crashed before the snapshot was written", async () => {
      const { state, source } = fakeUpstream();
      state.words = NEARLY_ALL;
      const files = await source.download("v1");
      await w.authoring.applySnapshot("jmdict", { upstreamVersion: "v1", checksum: "c" }, NEARLY_ALL);
      state.downloads = 0;
      await w.raw.keep("jmdict", "v1", files);

      const { report } = await runImport(w.deps, source);

      expect(report.status).toBe("unchanged");
      expect((await w.snapshots.latest("jmdict"))?.records).toHaveLength(3);
      expect(state.downloads).toBe(0);
    });

    it("fails without applying anything when the files cannot be parsed", async () => {
      const { state, source } = fakeUpstream();
      state.words = NEARLY_ALL;
      const broken: Source<"jmdict"> = { ...source, parse: () => {
          throw new Error("bad format");
        } };
      await expect(runImport(w.deps, broken)).rejects.toThrow("bad format");
      expect(await w.authoring.rows("importRun")).toEqual([]);
      expect(await w.snapshots.version("jmdict")).toBeNull();
    });
  });

importContract("an Import Run over fakes", async () => {
  const graph = emptyGraph();
  const snapshots = memorySnapshots();
  const raw = memoryRawFiles();
  const authoring = createFakeAuthoring(graph);
  return {
    authoring,
    snapshots,
    raw,
    deps: { authoring, snapshots, raw },
  };
});

describe("an Import Run over Postgres and a raw-file directory", () => {
  let pg: TestPostgres;
  let db: Db;
  let dir: string;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
    await migrate(db.$client, await collectMigrations([resolve(import.meta.dirname, "..")]));
    dir = await mkdtemp(join(tmpdir(), "import-"));
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("imports, reruns idempotently, replays a held run from the volume, and keeps three raw runs", async () => {
    const { state, source } = fakeUpstream();
    const authoring = createAuthoring(db);
    const snapshots = postgresSnapshots(db);
    const raw = directoryRawFiles(dir);
    const deps = { authoring, snapshots, raw };
    const filler = Array.from({ length: 98 }, (_, i) => word(`x${i}`, `語${i}`, `ご${i}`, `word ${i}`));
    state.words = [word("1", "食べる", "たべる", "to eat"), word("2", "飲む", "のむ", "to drink"), ...filler];

    const first = await runImport(deps, source);
    expect(first.report).toMatchObject({ status: "applied", counts: { added: 100 } });
    expect((await runImport(deps, source)).report.status).toBe("unchanged");
    expect(await authoring.rows("importRun")).toHaveLength(1);
    expect(state.downloads).toBe(1);

    state.version = "v2";
    state.words = [word("1", "食べる", "たべる", "to chew"), ...filler.slice(0, 5)];
    const held = await runImport(deps, source);
    expect(held.report.status).toBe("breaker tripped");
    expect((await snapshots.latest("jmdict"))?.upstreamVersion).toBe("v1");

    const released = await runImport(deps, source, { release: true });
    expect(released.report.status).toBe("applied");
    expect(state.downloads).toBe(2);
    expect((await snapshots.latest("jmdict"))?.records).toHaveLength(6);
    expect((await snapshots.diffs([released.report.importRunId])).get(released.report.importRunId)).toMatchObject({ gone: 94, changed: 1 });

    for (const version of ["v3", "v4", "v5"]) {
      state.version = version;
      await runImport(deps, source, { release: true });
    }
    expect((await readdir(join(dir, "jmdict"))).length).toBe(3);
    expect(await raw.read("jmdict", "v1")).toBeNull();
  });
});
