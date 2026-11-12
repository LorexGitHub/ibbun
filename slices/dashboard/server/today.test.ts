import { describe, expect, it } from "vitest";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { Today } from "../contract.ts";
import { buildToday } from "./today.ts";

const { graph, ids } = n5Fixture();
const kanji = Object.values(ids.kanji);
const words = Object.values(ids.words);
const grammar = Object.values(ids.grammar);
const contentGraph = createFakeContentGraph(graph);
const me = LearnerId.parse("00000000-0000-7000-8000-0000000000aa");
const NOW = new Date("2026-03-10T18:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000 - 9 * 3_600_000).toISOString();
const earlierToday = () => new Date(NOW.getTime() - 9 * 3_600_000).toISOString();

const setup = () => {
  const progress = createFakeProgress();
  const pass = (studyItemId: string, at: string, kind: "srs" | "manual" | "learn" = "srs") =>
    progress.record({ learnerId: me, studyItemId: StudyItemId.parse(studyItemId), kind, passed: true, at });
  const today = async () => Today.parse(await buildToday({ progress, contentGraph, batchSize: async () => 7, learnerId: me, now: NOW }));
  return { progress, pass, today };
};

describe("buildToday", () => {
  it("shows zero due and no streak, and every level's size, to a Learner with no Reviews", async () => {
    const { today } = setup();
    const t = await today();
    expect(t.due).toEqual({ total: 0, kanji: 0, word: 0, grammarPoint: 0 });
    expect(t.streakDays).toBe(0);
    expect(t.levels.map((l) => l.level)).toEqual(["N5", "N4", "N3", "N2", "N1"]);
    expect(t.levels[0]).toEqual({ level: "N5", total: 30, known: 0 });
    expect(t.levels[1]).toEqual({ level: "N4", total: 0, known: 0 });
  });

  it("says how many new Study Items one Learn batch holds", async () => {
    const { today } = setup();
    expect((await today()).batchSize).toBe(7);
  });

  it("counts due Study Items by type", async () => {
    const { pass, today } = setup();
    for (const id of [kanji[0]!, kanji[1]!, words[0]!, grammar[0]!]) await pass(id, daysAgo(30));
    expect((await today()).due).toEqual({ total: 4, kanji: 2, word: 1, grammarPoint: 1 });
  });

  it("leaves out items that are not due yet", async () => {
    const { pass, today } = setup();
    await pass(kanji[0]!, NOW.toISOString());
    expect((await today()).due.total).toBe(0);
  });

  it("counts Known Study Items per level, including ones made Known by Placement", async () => {
    const { pass, today } = setup();
    await pass(kanji[0]!, daysAgo(2));
    await pass(words[0]!, daysAgo(2), "manual");
    await pass(grammar[0]!, daysAgo(2), "learn");
    expect((await today()).levels[0]).toEqual({ level: "N5", total: 30, known: 2 });
  });

  it("counts a streak of days in a row ending today", async () => {
    const { pass, today } = setup();
    await pass(kanji[0]!, earlierToday());
    for (const n of [1, 2, 4]) await pass(kanji[0]!, daysAgo(n));
    expect((await today()).streakDays).toBe(3);
  });

  it("keeps the streak alive until the day is over", async () => {
    const { pass, today } = setup();
    for (const n of [1, 2]) await pass(kanji[0]!, daysAgo(n));
    expect((await today()).streakDays).toBe(2);
  });

  it("ends the streak after a missed day", async () => {
    const { pass, today } = setup();
    await pass(kanji[0]!, daysAgo(2));
    expect((await today()).streakDays).toBe(0);
  });

  it("ignores lookups, which are not practice", async () => {
    const { progress, today } = setup();
    await progress.record({ learnerId: me, studyItemId: StudyItemId.parse(kanji[0]!), kind: "lookup", passed: true, at: earlierToday() });
    expect((await today()).streakDays).toBe(0);
  });

  it("does not show another Learner's progress", async () => {
    const { pass, progress } = setup();
    await pass(kanji[0]!, daysAgo(30));
    const other = LearnerId.parse("00000000-0000-7000-8000-0000000000bb");
    const t = await buildToday({ progress, contentGraph, batchSize: async () => 7, learnerId: other, now: NOW });
    expect(t.due.total).toBe(0);
    expect(t.streakDays).toBe(0);
  });
});
