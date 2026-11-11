import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, changePreferences, type Preferences } from "./preferences.ts";

describe("DEFAULT_PREFERENCES", () => {
  it("follows the specs: Mixed furigana, romaji converted, English only, Exam Mode and slow speed off", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      furigana: "mixed",
      convertRomaji: true,
      explanations: "english",
      examMode: false,
      slowAudio: false,
    });
  });
});

describe("changePreferences", () => {
  const current: Preferences = { ...DEFAULT_PREFERENCES, furigana: "on", batchSize: 7 };

  it("changes only what the change names", () => {
    expect(changePreferences(current, { examMode: true })).toEqual({ ...current, examMode: true });
  });

  it("keeps the current preferences for an empty change", () => {
    expect(changePreferences(current, {})).toEqual(current);
  });

  it.each([
    [{ furigana: "sometimes" }],
    [{ explanations: "none" }],
    [{ batchSize: 0 }],
    [{ batchSize: 21 }],
    [{ batchSize: 2.5 }],
    [{ dailyBudget: 15 }],
    [{ convertRomaji: "yes" }],
    [{ theme: "dark" }],
  ])("refuses %j", (change) => {
    expect(() => changePreferences(current, change)).toThrow();
  });

  it.each([
    [{ batchSize: 1 }],
    [{ batchSize: 20 }],
    [{ explanations: "japanese" }],
    [{ explanations: "both" }],
    [{ furigana: "off" }],
  ])("accepts the edge value %j", (change) => {
    expect(changePreferences(current, change)).toEqual({ ...current, ...change });
  });
});
