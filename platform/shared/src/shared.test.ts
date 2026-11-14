import { describe, expect, it } from "vitest";
import { JlptLevel, LearnerId, StudyItemId, Timestamp, compareLevels, isShowcase } from "./index.ts";

describe("shared primitives", () => {
  it("accepts a UUID as an Id and rejects other strings", () => {
    const uuid = "7b0f5a4e-7f0e-4c1e-9d63-0c2a4f6b8e11";
    expect(LearnerId.parse(uuid)).toBe(uuid);
    expect(StudyItemId.safeParse("not-a-uuid").success).toBe(false);
  });

  it("accepts only the five JLPT levels", () => {
    expect(JlptLevel.parse("N3")).toBe("N3");
    expect(JlptLevel.safeParse("N6").success).toBe(false);
  });

  it("orders levels from easiest to hardest", () => {
    expect(compareLevels("N5", "N1")).toBeLessThan(0);
    expect(compareLevels("N1", "N5")).toBeGreaterThan(0);
    expect(compareLevels("N3", "N3")).toBe(0);
  });

  it("accepts ISO timestamps with an offset only", () => {
    expect(Timestamp.safeParse("2026-11-05T10:00:00Z").success).toBe(true);
    expect(Timestamp.safeParse("2026-11-05T10:00:00+09:00").success).toBe(true);
    expect(Timestamp.safeParse("2026-11-05").success).toBe(false);
    expect(Timestamp.safeParse("2026-11-05T10:00:00").success).toBe(false);
  });

  it("reads showcase mode from 1 only", () => {
    expect(["1"].map(isShowcase)).toEqual([true]);
    expect([undefined, "", "0", "true", "yes"].map(isShowcase)).toEqual([false, false, false, false, false]);
  });
});
