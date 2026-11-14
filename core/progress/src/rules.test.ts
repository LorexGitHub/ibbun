import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import { isLevelCleared } from "./cleared-level.ts";
import { showsFurigana } from "./furigana.ts";

const ids = (n: number) => Array.from({ length: n }, () => StudyItemId.parse(randomUUID()));

describe("isLevelCleared", () => {
  const [a, b, other] = ids(3);
  it("is cleared only when every Kanji of the level is Known", () => {
    expect(isLevelCleared([a!, b!], [b!, other!, a!])).toBe(true);
    expect(isLevelCleared([a!, b!], [a!, other!])).toBe(false);
    expect(isLevelCleared([a!], [])).toBe(false);
  });
  it("is not cleared for a level with no Kanji", () => {
    expect(isLevelCleared([], [a!])).toBe(false);
  });
});

describe("showsFurigana", () => {
  it("On shows it on every Word, Off on none", () => {
    for (const mastery of ["new", "young"] as const) {
      expect(showsFurigana("on", { mastery, reviewTarget: true })).toBe(true);
      expect(showsFurigana("off", { mastery })).toBe(false);
    }
  });
  it("Mixed shows it only on Words still New, and never on the Review target", () => {
    expect(showsFurigana("mixed", { mastery: "new" })).toBe(true);
    expect(showsFurigana("mixed", { mastery: "new", reviewTarget: true })).toBe(false);
    for (const mastery of ["learning", "young", "mature", "relearning"] as const) {
      expect(showsFurigana("mixed", { mastery })).toBe(false);
    }
  });
});
