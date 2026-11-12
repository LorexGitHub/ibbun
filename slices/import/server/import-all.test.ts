import { describe, expect, it } from "vitest";
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
  const source = <D extends "jmdict" | "kanjidic">(dataset: D, records: unknown[]): Refresh => ({
    source: {
      dataset,
      latest: async () => "v1",
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
  return { graph, downloads, everything, said, run: () => importEverything(everything, (line) => said.push(line)) };
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
});
