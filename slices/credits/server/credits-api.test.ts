import { createFakeContentGraph, emptyGraph } from "@ibbun/content-graph/testing";
import { describe, expect, it } from "vitest";
import { CreditsResponse } from "../contract.ts";
import { creditsApi } from "./credits-api.ts";

const graph = emptyGraph();
graph.importRun.push({ id: "run-1", dataset: "jmdict", upstreamVersion: "2026-11-02", checksum: "x", status: "applied", counts: {}, appliedAt: new Date("2026-11-02T00:00:00Z") });
graph.provenance.push({ id: "prov-1", source: { kind: "derived", process: "tts", version: "1" }, licence: "voicevox", author: "四国めたん", sourceUrl: null, inputs: [] });

const credits = async () => {
  const res = await creditsApi(() => createFakeContentGraph(graph)).request("/");
  expect(res.status).toBe(200);
  return CreditsResponse.parse(await res.json()).credits;
};

describe("GET /api/credits", () => {
  it("lists every source, including Waller and stephenmk, then each VOICEVOX voice in use", async () => {
    const names = (await credits()).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["JMdict", "UniDic", "hanabira", "Jonathan Waller's JLPT Resources (Tanos)", "yomitan-jlpt-vocab (stephenmk)"]));
    expect(names.at(-1)).toBe("VOICEVOX:四国めたん");
  });

  it("gives the live version and date of an imported source as ISO text, and nulls for one never imported", async () => {
    const list = await credits();
    expect(list.find((c) => c.name === "JMdict")).toMatchObject({ version: "2026-11-02", appliedAt: "2026-11-02T00:00:00.000Z" });
    expect(list.find((c) => c.name === "Wiktionary (ja)")).toMatchObject({ version: null, appliedAt: null });
  });
});
