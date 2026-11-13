import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentGraph, PathItem } from "@ibbun/content-graph";
import { createFakeProgress } from "@ibbun/progress/testing";
import { LearnerId, StudyItemId } from "@ibbun/shared";
import type { LearningPathConfig } from "../config.ts";
import type { LearningPath, LearningPathDeps } from "../learning-path.ts";
import { tieBreak } from "../strategy.ts";
import { DEFAULT_ACTIVE_TRACKS } from "../track.ts";
import { pathItem } from "./items.ts";

export type MakeLearningPath = (deps: Omit<LearningPathDeps, "store">) => Promise<LearningPath>;

const learner = () => LearnerId.parse(randomUUID());
const graphOf = (items: PathItem[]) => ({ pathItems: async () => items }) as unknown as ContentGraph;
const n3Word = { level: "N3", type: "word" } as const;
const n5Kanji = { level: "N5", type: "kanji" } as const;

/** Behaviour the Postgres-backed module and the fake share. */
export const learningPathContract = (make: MakeLearningPath) => {
  const kanji = [1, 300, 600].map((frequency) => pathItem("kanji", "N5", { frequency }));
  const word = pathItem("word", "N5", { dependsOn: [kanji[2]!.id] });
  const setup = async (config?: LearningPathConfig, seeds = ["seed-a", "seed-b"]) => {
    const progress = createFakeProgress();
    const path = await make({ contentGraph: graphOf([...kanji, word]), progress, config, newSeed: () => seeds.shift()! });
    return { progress, path };
  };
  const learn = (l: LearnerId, id: string) => ({ learnerId: l, studyItemId: StudyItemId.parse(id), kind: "learn" as const, passed: true, at: "2026-11-06T00:00:00Z" });

  describe("active Tracks", () => {
    it("start as the four N5 Tracks, whether or not start was called", async () => {
      const { path } = await setup();
      const [a, b] = [learner(), learner()];
      await path.start(a);
      expect(await path.activeTracks(a)).toEqual(DEFAULT_ACTIVE_TRACKS);
      expect(await path.activeTracks(b)).toEqual(DEFAULT_ACTIVE_TRACKS);
    });

    it("are replaced, in Track order without duplicates, and kept per Learner", async () => {
      const { path } = await setup();
      const [a, b] = [learner(), learner()];
      expect(await path.setActiveTracks(a, [n3Word, n5Kanji, n3Word])).toEqual([n5Kanji, n3Word]);
      expect(await path.activeTracks(a)).toEqual([n5Kanji, n3Word]);
      expect(await path.activeTracks(b)).toEqual(DEFAULT_ACTIVE_TRACKS);
      expect(await path.setActiveTracks(a, [])).toEqual([]);
      expect(await path.next(a, 5)).toEqual([]);
    });
  });

  describe("the seed", () => {
    it("is set once per Learner and orders ties", async () => {
      const clips = Array.from({ length: 6 }, () => pathItem("listening_clip", "N5"));
      const path = await make({ contentGraph: graphOf(clips), progress: createFakeProgress(), newSeed: (() => { const s = ["s1", "s2", "s3"]; return () => s.shift()!; })() });
      const [a, b] = [learner(), learner()];
      await path.start(a);
      await path.start(a);
      const order = (seed: string) => [...clips].sort((x, y) => tieBreak(seed, x.id).localeCompare(tieBreak(seed, y.id))).map((c) => c.id);
      expect(await path.next(a, 6)).toEqual(order("s1"));
      expect(await path.next(b, 6)).toEqual(order("s2"));
    });
  });

  describe("next, forItem and isLocked", () => {
    it("read introduced items from progress", async () => {
      const { path, progress } = await setup();
      const l = learner();
      await path.setActiveTracks(l, [n5Kanji, { level: "N5", type: "word" }]);
      expect(await path.next(l, 2)).toEqual([kanji[0]!.id, kanji[2]!.id, word.id]);
      await progress.record(learn(l, kanji[0]!.id));
      expect(await path.next(l, 1)).toEqual([kanji[1]!.id]);
      expect(await path.isLocked(l, kanji[1]!.id)).toBe(false);
      expect(await path.isLocked(l, kanji[2]!.id)).toBe(true);
      expect(await path.forItem(l, word.id)).toEqual([kanji[2]!.id, word.id]);
    });

    it("nextAt draws from one level only, for the types the Learner has active at any level", async () => {
      const n3 = { kanji: pathItem("kanji", "N3", { frequency: 1 }), word: pathItem("word", "N3"), grammar: pathItem("grammar_point", "N3") };
      const path = await make({ contentGraph: graphOf([...kanji, word, ...Object.values(n3)]), progress: createFakeProgress(), newSeed: () => "s" });
      const l = learner();
      await path.setActiveTracks(l, [n5Kanji, { level: "N4", type: "word" }]);
      expect(await path.nextAt(l, "N3", 5)).toEqual([n3.kanji.id, n3.word.id]);
      expect(await path.nextAt(l, "N3", 1)).toEqual([n3.kanji.id]);
      expect(await path.nextAt(l, "N2", 5)).toEqual([]);
      expect(await path.activeTracks(l)).toEqual([n5Kanji, { level: "N4", type: "word" }]);
    });

    it("use the strategy the config names", async () => {
      const { path } = await setup({ strategy: "frequency-v1", bands: { kanjiFrequency: 10_000, wordNfTags: 1 } }, ["x"]);
      const l = learner();
      const sameBand = [...kanji].sort((a, b) => tieBreak("x", a.id).localeCompare(tieBreak("x", b.id)));
      expect((await path.next(l, 1)).at(-1)).toBe(sameBand[0]!.id);
    });
  });
};
