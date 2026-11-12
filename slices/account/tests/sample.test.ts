import { describe, expect, it } from "vitest";
import { passes, SAMPLE } from "../web/sample.ts";

describe("the Review a visitor can try", () => {
  it("passes an accepted meaning, whatever its case or the space around it", () => {
    expect(passes(SAMPLE, "water")).toBe(true);
    expect(passes(SAMPLE, "  WATER ")).toBe(true);
  });

  it("fails anything else, an empty answer too", () => {
    expect(passes(SAMPLE, "fire")).toBe(false);
    expect(passes(SAMPLE, "")).toBe(false);
    expect(passes({ ...SAMPLE, accepted: ["cold water", "water"] }, "cold water")).toBe(true);
  });
});
