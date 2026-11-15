import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { currentLevel } from "@ibbun/content-graph/levels";
import { applyEditorialLevels } from "./index.ts";
import { EDITORIAL_LEVELS } from "./levels.ts";

/** ありがとう as JMdict entry 1586820, rated N3 by a List source. */
const world = () => {
  const graph = emptyGraph();
  const a = createFakeAuthoring(graph);
  const imported = randomUUID();
  graph.provenance.push({ id: imported, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const word = randomUUID();
  graph.studyItem.push({ id: word, type: "word", approval: "approved", retired: false, provenanceId: imported });
  graph.sourceKey.push({ dataset: "jmdict", upstreamKey: "1586820", recordId: word });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: word, level: "N3", kind: "list", approval: "approved", retired: false, provenanceId: imported });
  return { graph, a, word };
};

const THANKS = [{ jmdict: "1586820", word: "ありがとう", level: "N5", why: "test" }] as const;

describe("applyEditorialLevels", () => {
  it("gives the Word an approved Editorial level, which outranks the List one", async () => {
    const w = world();
    expect(await applyEditorialLevels(w.a, THANKS)).toEqual({ added: 1, missing: [] });
    expect(currentLevel(await w.a.rows("levelCandidate", { studyItemId: w.word }))).toBe("N5");
    const [provenance] = w.graph.provenance.filter((p) => p.source.kind === "authored" && p.source.by.startsWith("supervisor"));
    expect(w.graph.levelCandidate.find((c) => c.kind === "editorial")!.provenanceId).toBe(provenance!.id);
  });

  it("adds nothing the second time, and reports a Word that is not in the graph", async () => {
    const w = world();
    await applyEditorialLevels(w.a, THANKS);
    expect(await applyEditorialLevels(w.a, [...THANKS, { jmdict: "9999999", word: "ない", level: "N5", why: "test" }])).toEqual({ added: 0, missing: ["ない (JMdict 9999999)"] });
    expect(w.graph.levelCandidate.filter((c) => c.kind === "editorial")).toHaveLength(1);
    expect(w.graph.provenance.filter((p) => p.source.kind === "authored" && p.source.by.startsWith("supervisor"))).toHaveLength(1);
  });

  it("lists each entry once, with a reason", () => {
    expect(new Set(EDITORIAL_LEVELS.map((e) => e.jmdict)).size).toBe(EDITORIAL_LEVELS.length);
    for (const e of EDITORIAL_LEVELS) expect(e.why.length).toBeGreaterThan(0);
  });
});
