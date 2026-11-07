import { describe, expect, it } from "vitest";
import { earlierItemCount, passageType, targetLength } from "./plan-numbers.ts";

describe("target length", () => {
  it("moves in a straight line from the shortest to the longest exam passage", () => {
    expect(targetLength("N5", 0)).toBe(80);
    expect(targetLength("N5", 0.5)).toBe(165);
    expect(targetLength("N5", 1)).toBe(250);
    expect(targetLength("N1", 0.25)).toBe(400);
  });

  it("stays in range when progress is out of bounds", () => {
    expect(targetLength("N3", -1)).toBe(100);
    expect(targetLength("N3", 2)).toBe(550);
  });

  it("grows an Unlevelled batch in bands of 200 items up to the N1 長文 length", () => {
    expect(targetLength("unlevelled", 0)).toBe(200);
    expect(targetLength("unlevelled", 199)).toBe(200);
    expect(targetLength("unlevelled", 200)).toBe(400);
    expect(targetLength("unlevelled", 800)).toBe(1000);
    expect(targetLength("unlevelled", 5000)).toBe(1000);
  });

  it("brings back about one earlier item per 50 characters", () => {
    expect(earlierItemCount(80)).toBe(2);
    expect(earlierItemCount(1000)).toBe(20);
  });
});

describe("passage type rotation", () => {
  it("cycles through the level's types, one per episode", () => {
    expect([1, 2, 3, 4, 5, 6].map((e) => passageType("N5", e))).toEqual([
      "memo", "notice", "email", "diary", "short explanation", "memo",
    ]);
  });

  it("adds the essay at N3 and commentary and argument at N2, N1 and Unlevelled", () => {
    expect(passageType("N3", 7)).toBe("short essay (随筆)");
    for (const level of ["N2", "N1", "unlevelled"] as const) expect(passageType(level, 9)).toBe("argument (主張)");
    expect(passageType("N4", 7)).toBe("notice");
  });
});
