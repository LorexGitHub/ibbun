import { describe, expect, it } from "vitest";
import { loadGenerationConfig } from "./config.ts";

describe("loadGenerationConfig", () => {
  it("defaults to 2,000,000 tokens a day with Batch Texts at half", () => {
    expect(loadGenerationConfig({})).toEqual({ dailyTokenBudget: 2_000_000, batchTextShare: 0.5 });
  });

  it("reads DAILY_TOKEN_BUDGET", () => {
    expect(loadGenerationConfig({ DAILY_TOKEN_BUDGET: "500000" }).dailyTokenBudget).toBe(500_000);
  });

  it("rejects a budget that is not a positive whole number", () => {
    expect(() => loadGenerationConfig({ DAILY_TOKEN_BUDGET: "-5" })).toThrow();
    expect(() => loadGenerationConfig({ DAILY_TOKEN_BUDGET: "lots" })).toThrow();
  });
});
