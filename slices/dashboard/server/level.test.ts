import { describe, expect, it } from "vitest";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { LevelPage } from "../contract.ts";
import { buildLevel } from "./level.ts";

const { graph, ids } = n5Fixture();
const kanji = Object.values(ids.kanji);
const words = Object.values(ids.words);
const grammar = Object.values(ids.grammar);
const contentGraph = createFakeContentGraph(graph);
const me = LearnerId.parse("00000000-0000-7000-8000-0000000000aa");
const NOW = new Date("2026-03-10T18:00:00Z");
const LONG_AGO = "2026-02-01T09:00:00Z";

const setup = () => {
  const progress = createFakeProgress();
  const pass = (studyItemId: string, at: string) => progress.record({ learnerId: me, studyItemId: StudyItemId.parse(studyItemId), kind: "srs", passed: true, at });
  const page = async (level: "N5" | "N4" = "N5") => LevelPage.parse(await buildLevel({ progress, contentGraph, learnerId: me, now: NOW, level }));
  return { pass, page };
};

describe("buildLevel", () => {
  it("counts the level's Kanji, Words and Grammar Points apart, with nothing Known or due at the start", async () => {
    const { page } = setup();
    expect(await page()).toEqual({
      level: "N5",
      kanji: { total: kanji.length, known: 0 },
      word: { total: words.length, known: 0 },
      grammarPoint: { total: grammar.length, known: 0 },
      due: 0,
      clips: (await contentGraph.listeningClips("N5")).length,
    });
  });

  it("counts what the Learner knows by type, and what is due now", async () => {
    const { pass, page } = setup();
    for (const id of [kanji[0]!, kanji[1]!, words[0]!]) await pass(id, LONG_AGO);
    await pass(grammar[0]!, NOW.toISOString());
    const p = await page();
    expect([p.kanji.known, p.word.known, p.grammarPoint.known]).toEqual([2, 1, 1]);
    expect(p.due).toBe(3);
  });

  it("leaves another level's Known and due Study Items out", async () => {
    const { pass, page } = setup();
    await pass(kanji[0]!, LONG_AGO);
    expect(await page("N4")).toEqual({
      level: "N4",
      kanji: { total: 0, known: 0 },
      word: { total: 0, known: 0 },
      grammarPoint: { total: 0, known: 0 },
      due: 0,
      clips: 0,
    });
  });
});
