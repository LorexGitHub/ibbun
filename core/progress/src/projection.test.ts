import { describe, expect, it } from "vitest";
import { MATURE_STABILITY_DAYS, masteryOf } from "./projection.ts";

describe("masteryOf", () => {
  it("draws the Young/Mature line at a stability of 21 days", () => {
    expect(MATURE_STABILITY_DAYS).toBe(21);
    expect(masteryOf(true, 20.99, false)).toBe("young");
    expect(masteryOf(true, 21, false)).toBe("mature");
  });

  it("puts Relearning ahead of stability, and Learning ahead of both", () => {
    expect(masteryOf(true, 50, true)).toBe("relearning");
    expect(masteryOf(false, 50, true)).toBe("learning");
  });
});
