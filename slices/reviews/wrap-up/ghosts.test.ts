import { describe, expect, it } from "vitest";
import type { Review } from "@ibbun/progress";
import { StudyItemId, type LearnerId } from "@ibbun/shared";
import { GHOST_AFTER_MS, GHOST_UNTIL_MS, ghostsOf } from "./ghosts.ts";
import { pickDifferent } from "./pick.ts";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const A = StudyItemId.parse("00000000-0000-4000-8000-00000000000a");
const B = StudyItemId.parse("00000000-0000-4000-8000-00000000000b");

let counter = 0;
const review = (over: Partial<Review>): Review => ({
  id: `r${counter++}`,
  learnerId: "l" as LearnerId,
  studyItemId: A,
  kind: "srs",
  passed: false,
  at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
  exampleId: "ex-1",
  facets: [],
  attempts: [],
  hintsOpened: [],
  revealed: false,
  ...over,
});
const agoMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("which misses raise a Ghost", () => {
  it("names the Study Item and the exact Example that was missed", () => {
    expect(ghostsOf([review({})], NOW)).toEqual([{ studyItemId: A, exampleId: "ex-1" }]);
  });

  it("starts an hour after the miss and ends two days after it, both ends included", () => {
    expect(ghostsOf([review({ at: agoMs(GHOST_AFTER_MS - 1) })], NOW)).toEqual([]);
    expect(ghostsOf([review({ at: agoMs(GHOST_AFTER_MS) })], NOW)).toHaveLength(1);
    expect(ghostsOf([review({ at: agoMs(GHOST_UNTIL_MS) })], NOW)).toHaveLength(1);
    expect(ghostsOf([review({ at: agoMs(GHOST_UNTIL_MS + 1) })], NOW)).toEqual([]);
  });

  it("ignores a pass and a miss that names no Example", () => {
    expect(ghostsOf([review({ passed: true })], NOW)).toEqual([]);
    expect(ghostsOf([review({ exampleId: undefined })], NOW)).toEqual([]);
  });

  it("looks only at the latest scheduled Review, so a later pass ends the Ghost", () => {
    const log = [review({ at: agoMs(5 * 3_600_000) }), review({ passed: true, at: agoMs(3 * 3_600_000) })];
    expect(ghostsOf(log, NOW)).toEqual([]);
  });

  it("is answered once a Ghost Review follows the miss, but a newer miss raises a new one", () => {
    const miss = review({ at: agoMs(5 * 3_600_000) });
    const answered = [miss, review({ kind: "ghost", at: agoMs(4 * 3_600_000) })];
    expect(ghostsOf(answered, NOW)).toEqual([]);
    expect(ghostsOf([...answered, review({ exampleId: "ex-2", at: agoMs(2 * 3_600_000) })], NOW)).toEqual([
      { studyItemId: A, exampleId: "ex-2" },
    ]);
  });

  it("ignores Wrap-Up, Learn and manual Reviews", () => {
    const log = [review({ at: agoMs(5 * 3_600_000) }), review({ kind: "wrap-up", passed: true, at: agoMs(3 * 3_600_000) })];
    expect(ghostsOf(log, NOW)).toHaveLength(1);
    expect(ghostsOf([review({ kind: "learn" }), review({ kind: "manual" })], NOW)).toEqual([]);
  });

  it("keeps each Study Item apart", () => {
    const log = [review({ studyItemId: A, exampleId: "a" }), review({ studyItemId: B, exampleId: "b", kind: "ghost" })];
    expect(ghostsOf(log, NOW)).toEqual([{ studyItemId: A, exampleId: "a" }]);
  });
});

describe("the Example a Wrap-Up re-ask uses", () => {
  const examples = ["a", "b", "c"].map((id) => ({ id })) as Parameters<typeof pickDifferent>[0];
  const pick = (asked: string[], from = examples) => pickDifferent(from, asked)?.id;

  it("is the first one not asked yet", () => {
    expect(pick(["a"])).toBe("b");
    expect(pick(["a", "b"])).toBe("c");
  });

  it("is any but the latest once all were asked", () => {
    expect(pick(["a", "b", "c"])).toBe("a");
    expect(pick(["c", "b", "a"])).toBe("b");
  });

  it("is the only Example when there is just one, and nothing when there is none", () => {
    expect(pick(["a"], examples.slice(0, 1))).toBe("a");
    expect(pick([], [])).toBeUndefined();
  });
});
