import { describe, expect, it } from "vitest";
import { loadN5Fixture } from "@mojibun/content-graph/authoring";
import { createFakeAuthoring, createFakeLevels, emptyGraph } from "@mojibun/content-graph/testing";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeNlp } from "@mojibun/nlp";
import { importEverything, type Everything } from "./import-all.ts";
import type { Refresh } from "./jobs.ts";
import { memoryRawFiles } from "./raw-files.ts";
import { memorySnapshots } from "./snapshots.ts";
import type { Source } from "./source.ts";

const word = { key: "1", forms: ["食べる"], readings: [{ text: "たべる", pitchAccent: null }], senses: [{ partsOfSpeech: ["v1"], glosses: ["to eat"] }], priorityTags: [] };
const kanji = { key: "食", meanings: ["eat"], onReadings: ["ショク"], kunReadings: ["た.べる"], grade: 2, frequency: 328, strokeCount: 9, components: [], strokes: [] };

const world = () => {
  const graph = emptyGraph();
  const downloads: string[] = [];
  const upstream = { version: "v1" };
  const source = <D extends "jmdict" | "kanjidic">(dataset: D, records: unknown[]): Refresh => ({
    source: {
      dataset,
      latest: async () => upstream.version,
      download: async () => (downloads.push(dataset), [{ name: "f", bytes: new Uint8Array() }]),
      parse: () => records,
    } as Source,
    cron: "0 12 * * *",
    monthly: false,
  });
  const authoring = createFakeAuthoring(graph);
  const jobs = createFakeJobs();
  const everything: Everything = {
    imports: { authoring, snapshots: memorySnapshots(), raw: memoryRawFiles() },
    refreshes: [source("jmdict", [word]), source("kanjidic", [kanji])],
    grammarSeed: {
      nlp: createFakeNlp([]),
      jobs,
      authoring,
      transact: (work) => work(authoring),
      download: async () => ({ hanabiraCommit: "c", tanosSnapshot: "2020", hanabira: [], tanos: [{ key: "N5:0", level: "N5", title: "です" }] }),
    },
    matcherRuns: { authoring, jobs },
    levels: createFakeLevels(graph),
  };
  const said: string[] = [];
  return { graph, downloads, upstream, everything, said, run: () => importEverything(everything, (line) => said.push(line)) };
};

describe("importing everything at once", () => {
  it("runs each source in list order, then the grammar seed, derived links, levels and matchers, and says what each did", async () => {
    const w = world();
    await w.run();
    expect(w.downloads).toEqual(["jmdict", "kanjidic"]);
    expect(w.said).toEqual([
      "jmdict v1: applied, 1 added, 0 changed, 0 retired",
      "kanjidic v1: applied, 1 added, 0 changed, 0 retired",
      "grammar seed: seeded",
      "derived links: 1 added, 0 removed",
      "levels: 3 changed, 1 derived",
      "matchers: 0 links proposed, 0 Generation Requests opened",
    ]);
    expect(w.graph.wordContainsKanji).toHaveLength(1);
  });

  it("changes nothing when it is run again, and downloads nothing", async () => {
    const w = world();
    await w.run();
    const before = structuredClone(w.graph);
    w.said.length = 0;
    await w.run();
    expect(w.downloads).toEqual(["jmdict", "kanjidic"]);
    expect(w.said).toEqual([
      "jmdict v1: unchanged, 1 added, 0 changed, 0 retired",
      "kanjidic v1: unchanged, 1 added, 0 changed, 0 retired",
      "grammar seed: already seeded",
      "derived links: 0 added, 0 removed",
      "levels: 0 changed, 0 derived",
      "matchers: 0 links proposed, 0 Generation Requests opened",
    ]);
    expect(w.graph).toEqual(before);
  });

  it("stops at the first source that fails, so nothing is built on half the data", async () => {
    const w = world();
    w.everything.refreshes[0]!.source.parse = () => {
      throw new Error("bad file");
    };
    await expect(w.run()).rejects.toThrow("bad file");
    expect(w.said).toEqual([]);
    expect(w.graph.studyItem).toEqual([]);
  });

  it("refuses a database that holds the N5 fixture, before it downloads anything", async () => {
    const w = world();
    await loadN5Fixture(w.everything.imports.authoring, {});

    await expect(w.run()).rejects.toThrow("N5 fixture");
    expect(w.downloads).toEqual([]);
  });

  /** Makes the circuit breaker hold every run that is not released, as a large first load of levels does. */
  const tripBreaker = (w: ReturnType<typeof world>) => {
    const { authoring } = w.everything.imports;
    const apply = authoring.applySnapshot.bind(authoring);
    const released: string[] = [];
    const NONE = { added: 0, changed: 0, retired: 0 };
    let held = 0;
    authoring.applySnapshot = async (dataset, version, records, options) => {
      if (!options?.release) {
        const importRunId = `00000000-0000-7000-8000-00000000000${held++}`;
        await authoring.insert("importRun", [{ id: importRunId, dataset, ...version, status: "breaker tripped", counts: NONE, appliedAt: null }]);
        return { importRunId, status: "breaker tripped", counts: NONE as never, tripped: ["level changes"] };
      }
      released.push(dataset);
      return apply(dataset, version, records, options);
    };
    return released;
  };

  it("releases a dataset's first import when the circuit breaker holds it: there is no content yet to protect", async () => {
    const w = world();
    const released = tripBreaker(w);
    await w.run();
    expect(released).toEqual(["jmdict", "kanjidic"]);
    expect(w.said.slice(0, 4)).toEqual([
      "jmdict: first import, released from the circuit breaker",
      "jmdict v1: applied, 1 added, 0 changed, 0 retired",
      "kanjidic: first import, released from the circuit breaker",
      "kanjidic v1: applied, 1 added, 0 changed, 0 retired",
    ]);
    expect(w.downloads).toEqual(["jmdict", "kanjidic"]);
  });

  it("leaves a later import with the circuit breaker, for the supervisor to release", async () => {
    const w = world();
    await w.run();
    const released = tripBreaker(w);
    w.upstream.version = "v2";
    w.said.length = 0;
    await w.run();
    expect(released).toEqual([]);
    expect(w.said.slice(0, 2)).toEqual(["jmdict v2: breaker tripped, 0 added, 0 changed, 0 retired", "jmdict: held by the circuit breaker, level changes"]);
  });
});
