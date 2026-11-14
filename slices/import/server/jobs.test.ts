import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { createFakeJobs } from "@ibbun/jobs";
import { importJobs, refreshJob, refreshes, type Refresh } from "./jobs.ts";
import { memoryRawFiles } from "./raw-files.ts";
import { memorySnapshots } from "./snapshots.ts";
import type { Source } from "./source.ts";
import type { Home, ImportTasks, TaskRequest } from "./tasks.ts";

const word = { key: "1", forms: ["食べる"], readings: [{ text: "たべる", pitchAccent: null }], senses: [{ partsOfSpeech: ["v1"], glosses: ["to eat"] }], priorityTags: [], usuallyKana: false };

const world = (now: string, { home = "lambda", tasks = null }: { home?: Home; tasks?: ImportTasks | null } = {}) => {
  const graph = emptyGraph();
  const downloads: string[] = [];
  const source: Source<"jmdict"> = {
    dataset: "jmdict",
    latest: async () => `v-${now}`,
    download: async (version) => (downloads.push(version), [{ name: "f", bytes: new Uint8Array() }]),
    parse: () => [word],
  };
  const deps = { authoring: createFakeAuthoring(graph), snapshots: memorySnapshots(), raw: memoryRawFiles() };
  const list: Refresh[] = [{ source: source as Source, cron: "0 12 * * *", monthly: true, home }];
  const jobs = createFakeJobs();
  const ready = async () => {
    const handlers = importJobs(deps, list, { now: () => new Date(now), tasks });
    await jobs.work(handlers);
    for (const { contract, schedule } of handlers) await jobs.schedule(contract, schedule!.cron, schedule!.payload);
  };
  return { graph, deps, downloads, jobs, ready };
};

describe("import jobs", () => {
  it("schedules each source and a daily staleness check, so no human starts a refresh", async () => {
    const w = world("2026-11-02T12:00:00Z");
    await w.ready();
    expect(w.jobs.schedules()).toEqual(
      new Map([
        ["import.jmdict", "0 12 * * *"],
        ["import.staleness", "0 7 * * *"],
      ]),
    );
  });

  it("imports JMdict when the schedule fires on a first Monday", async () => {
    const w = world("2026-11-02T12:00:00Z");
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(w.downloads).toEqual(["v-2026-11-02T12:00:00Z"]);
    expect((await w.deps.authoring.rows("importRun")).map((r) => r.status)).toEqual(["applied"]);
  });

  it("does nothing on a later day of a month whose refresh already went live", async () => {
    const w = world("2026-11-19T12:00:00Z");
    w.graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: new Date("2026-11-02T12:05:00Z") });
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(w.downloads).toEqual([]);
  });

  it("tries again the day after a first-Monday run failed", async () => {
    const w = world("2026-11-03T12:00:00Z");
    w.graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: new Date("2026-10-06T12:05:00Z") });
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(w.downloads).toHaveLength(1);
  });

  it("runs a replayed job at any time, and releases a held run when asked", async () => {
    const w = world("2026-11-19T12:00:00Z");
    w.graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: new Date("2026-11-02T12:05:00Z") });
    await w.ready();
    await w.jobs.enqueue(refreshJob("jmdict"), {});
    await w.jobs.drain();
    expect(w.downloads).toHaveLength(1);
  });

  it("hands a Fargate-home refresh to a task and runs none of it in the worker", async () => {
    const started: TaskRequest[] = [];
    const tasks: ImportTasks = { start: async (request) => (started.push(request), "started") };
    const w = world("2026-11-19T12:00:00Z", { home: "fargate", tasks });
    await w.ready();
    await w.jobs.enqueue(refreshJob("jmdict"), { release: true });
    await w.jobs.drain();
    expect(started).toEqual([{ dataset: "jmdict", release: true }]);
    expect(w.downloads).toEqual([]);
  });

  it("starts no task for a monthly refresh that is not due", async () => {
    const started: TaskRequest[] = [];
    const tasks: ImportTasks = { start: async (request) => (started.push(request), "started") };
    const w = world("2026-11-19T12:00:00Z", { home: "fargate", tasks });
    w.graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: new Date("2026-11-02T12:05:00Z") });
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(started).toEqual([]);
  });

  it("runs a Fargate-home refresh in the worker where no task cluster is configured, as locally", async () => {
    const w = world("2026-11-02T12:00:00Z", { home: "fargate" });
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(w.downloads).toHaveLength(1);
  });

  it("runs a Lambda-home refresh in the worker even with a task cluster", async () => {
    const tasks: ImportTasks = { start: async () => expect.unreachable("no task for a Lambda-home source") };
    const w = world("2026-11-02T12:00:00Z", { tasks });
    await w.ready();
    await w.jobs.fire("import.jmdict");
    await w.jobs.drain();
    expect(w.downloads).toHaveLength(1);
  });

  it("writes each note of the run's report to the log", async () => {
    const w = world("2026-11-02T12:00:00Z");
    const { authoring } = w.deps;
    const applySnapshot: typeof authoring.applySnapshot = async (...args) => ({ ...(await authoring.applySnapshot(...args)), notes: ["ent_seq 9 is not in JMdict: skipped"] });
    w.deps.authoring = { ...authoring, applySnapshot };
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await w.ready();
      await w.jobs.fire("import.jmdict");
      await w.jobs.drain();
      expect(info.mock.calls).toEqual([["import.jmdict: ent_seq 9 is not in JMdict: skipped"]]);
    } finally {
      info.mockRestore();
    }
  });

  it("raises a staleness alarm when the check job runs and JMdict is older than 31 days", async () => {
    const w = world("2026-11-19T12:00:00Z");
    w.graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: new Date("2026-09-01T00:00:00Z") });
    await w.ready();
    await w.jobs.fire("import.staleness");
    await w.jobs.drain();
    expect(await w.deps.authoring.queue({ reason: "staleness alarm" })).toHaveLength(1);
  });

  it("downloads for every source through the fetch it is given", async () => {
    const asked: string[] = [];
    const sources = refreshes({}, async (input) => (asked.push(new URL(String(input)).host), new Response("", { status: 404 })));
    for (const { source } of sources) await source.latest().catch(() => undefined);
    expect(asked).toEqual(["api.github.com", "api.github.com", "api.github.com", "downloads.tatoeba.org", "api.github.com", "kaikki.org", "clrd.ninjal.ac.jp"]);
  });

  it("asks an upstream that drops the connection three times before a refresh fails", async () => {
    const fetch = vi.fn(async () => Promise.reject(new TypeError("fetch failed")));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(refreshes()[0]!.source.latest()).rejects.toThrow("fetch failed");
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes JMdict and KANJIDIC2 monthly, KanjiVG, Tatoeba, yomitan-jlpt-vocab, ja Wiktionary and UniDic weekly, and tries the one-time Tanos kanji import daily; JMdict and Tatoeba run as Fargate tasks", () => {
    expect(refreshes().map((r) => [r.source.dataset, r.monthly, r.cron, r.home])).toEqual([
      ["jmdict", true, "0 12 * * *", "fargate"],
      ["kanjidic", true, "0 12 * * *", "lambda"],
      ["kanjivg", false, "0 12 * * 1", "lambda"],
      ["tatoeba", false, "0 12 * * 6,0", "fargate"],
      ["yomitan", false, "0 8 * * 1", "lambda"],
      ["wiktionary-ja", false, "0 12 * * 1", "lambda"],
      ["unidic", false, "0 12 * * 1", "lambda"],
      ["tanos", false, "0 13 * * *", "lambda"],
    ]);
  });
});
