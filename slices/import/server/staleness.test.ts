import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Dataset } from "@mojibun/content-graph/authoring";
import { createFakeAuthoring, emptyGraph } from "@mojibun/content-graph/testing";
import { checkStaleness } from "./staleness.ts";

const NOW = new Date("2026-11-10T00:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const world = (runs: [Dataset, number | null, string?][]) => {
  const graph = emptyGraph();
  for (const [dataset, ago, status = "applied"] of runs) {
    graph.importRun.push({ id: randomUUID(), dataset, upstreamVersion: `${dataset}-v`, checksum: "c", status, counts: {}, appliedAt: ago === null ? null : daysAgo(ago) });
  }
  return createFakeAuthoring(graph);
};

describe("checkStaleness", () => {
  it("raises nothing while both EDRDG datasets are 31 days old or younger", async () => {
    const authoring = world([["jmdict", 31], ["kanjidic", 2]]);
    expect(await checkStaleness(authoring, NOW)).toEqual([]);
    expect(await authoring.queue()).toEqual([]);
  });

  it("queues one staleness alarm, tied to the live run, for a dataset older than 31 days", async () => {
    const authoring = world([["jmdict", 40], ["kanjidic", 2]]);
    expect(await checkStaleness(authoring, NOW)).toEqual(["jmdict"]);
    const [alarm, ...rest] = await authoring.queue();
    expect(rest).toEqual([]);
    expect(alarm).toMatchObject({ reason: "staleness alarm", detail: { dataset: "jmdict", upstreamVersion: "jmdict-v", days: 40 } });
    expect(alarm!.importRunId).toBe((await authoring.rows("importRun", { dataset: "jmdict" }))[0]!.id);
  });

  it("alarms each stale dataset, and does not queue a second alarm for the same dataset", async () => {
    const authoring = world([["jmdict", 40], ["kanjidic", 45]]);
    expect(await checkStaleness(authoring, NOW)).toEqual(["jmdict", "kanjidic"]);
    await checkStaleness(authoring, NOW);
    expect(await authoring.queue({ reason: "staleness alarm" })).toHaveLength(2);
  });

  it("judges by the newest applied run, ignoring runs held by the breaker or never applied", async () => {
    const authoring = world([["jmdict", 90], ["jmdict", 3], ["jmdict", null, "breaker tripped"], ["kanjidic", 1]]);
    expect(await checkStaleness(authoring, NOW)).toEqual([]);
  });

  it("raises nothing for a dataset that was never imported, nor for datasets outside EDRDG", async () => {
    const authoring = world([["tatoeba", 400]]);
    expect(await checkStaleness(authoring, NOW)).toEqual([]);
    expect(await authoring.queue()).toEqual([]);
  });

  it("resolves its own alarm once the dataset is fresh again", async () => {
    const graph = emptyGraph();
    graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "old", checksum: "c", status: "applied", counts: {}, appliedAt: daysAgo(40) });
    const authoring = createFakeAuthoring(graph);
    await checkStaleness(authoring, NOW);
    expect(await authoring.queue()).toHaveLength(1);
    graph.importRun.push({ id: randomUUID(), dataset: "jmdict", upstreamVersion: "new", checksum: "c", status: "applied", counts: {}, appliedAt: daysAgo(1) });
    expect(await checkStaleness(authoring, NOW)).toEqual([]);
    expect(await authoring.queue()).toEqual([]);
  });
});
