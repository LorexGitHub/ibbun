import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LearnerId, StudyItemId } from "@ibbun/shared";
import type { NewBatchText, NewPracticeText, Texts } from "../texts.ts";

const learner = () => LearnerId.parse(randomUUID());
const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-01T00:00:00.000Z");
const hour = (n: number) => new Date(T0 + n * HOUR).toISOString();

const batch = (learnerId: LearnerId, at: string, episode = 1): NewBatchText => ({
  kind: "batch",
  learnerId,
  level: "N4",
  episode,
  studyItemIds: [StudyItemId.parse(randomUUID()), StudyItemId.parse(randomUUID())],
  passageId: randomUUID(),
  episodeSummary: "ゆきが駅で友だちに会った。",
  cast: ["ゆき", "たろう"],
  at,
});

const practice = (learnerId: LearnerId, at: string): NewPracticeText => ({
  kind: "practice",
  learnerId,
  level: "N5",
  form: "dialogue",
  passageType: "any",
  length: "short",
  topic: "旅行",
  passageId: randomUUID(),
  at,
});

/** Behaviour the real Texts and the fake share. */
export const textsContract = (make: () => Promise<Texts>) => {
  describe("Batch Text and Practice Text records", () => {
    it("records Batch Texts and reads them back oldest first, for that Learner only", async () => {
      const texts = await make();
      const l = learner();
      const second = await texts.record(batch(l, hour(5), 2));
      const first = await texts.record({ ...batch(l, "2026-11-01T09:00:00+09:00"), level: "unlevelled" });
      await texts.record(batch(learner(), hour(1)));
      expect(first.at).toBe(hour(0));
      expect(first.id).not.toBe(second.id);
      expect(await texts.batchTexts(l)).toEqual([first, second]);
      expect(await texts.practiceTexts(l)).toEqual([]);
    });

    it("records Practice Texts apart from Batch Texts", async () => {
      const texts = await make();
      const l = learner();
      const p = await texts.record(practice(l, hour(0)));
      const { topic: _, ...noTopic } = practice(l, hour(1));
      const q = await texts.record({ ...noTopic, form: "passage", length: "exam" });
      expect(await texts.practiceTexts(l)).toEqual([p, q]);
      expect(await texts.batchTexts(l)).toEqual([]);
    });

    it("refuses a record that does not parse", async () => {
      const texts = await make();
      const l = learner();
      await expect(texts.record({ ...batch(l, hour(0)), episode: 0 })).rejects.toThrow();
      await expect(texts.record({ ...practice(l, hour(0)), level: "unlevelled" } as never)).rejects.toThrow();
      expect(await texts.batchTexts(l)).toEqual([]);
    });
  });

  describe("the rolling 24 h count", () => {
    it("counts each kind separately in the 24 h up to the given time", async () => {
      const texts = await make();
      const l = learner();
      await texts.record(batch(l, hour(0)));
      await texts.record(batch(l, hour(10)));
      await texts.record(batch(l, hour(23)));
      await texts.record(practice(l, hour(20)));
      await texts.record(batch(learner(), hour(20)));
      const at = new Date(T0 + 24 * HOUR);
      expect(await texts.countLast24h(l, "batch", at)).toBe(2);
      expect(await texts.countLast24h(l, "practice", at)).toBe(1);
      expect(await texts.countLast24h(l, "batch", new Date(T0 + 24 * HOUR - 1))).toBe(3);
      expect(await texts.countLast24h(l, "batch", new Date(T0 + 10 * HOUR))).toBe(2);
      expect(await texts.countLast24h(learner(), "practice", at)).toBe(0);
    });
  });
};
