import { describe, expect, it } from "vitest";
import type { StudyItemId } from "@ibbun/shared";
import { byRank, levelRank, searchTerms } from "./read.ts";

describe("searchTerms", () => {
  it("searches romaji as itself and as hiragana", () => {
    expect(searchTerms(" Taberu ")).toEqual(["taberu", "たべる"]);
  });

  it("keeps an English word, kana and kanji as they are", () => {
    expect(searchTerms("water")).toEqual(["water"]);
    expect(searchTerms("たべる")).toEqual(["たべる"]);
    expect(searchTerms("食")).toEqual(["食"]);
  });

  it("is empty for a blank query", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("byRank", () => {
  const match = (tier: number, label: string, level: "N5" | "N2" | null, id = label) => ({
    tier,
    summary: { id: id as StudyItemId, type: "word" as const, level, label, reading: null, meaning: null },
  });
  const order = (...matches: ReturnType<typeof match>[]) => [...matches].sort(byRank).map((m) => m.summary.label);

  it("puts the better tier first, then items on a level, easiest first", () => {
    expect(order(match(1, "水分", "N5"), match(0, "お水", null), match(0, "氵", null), match(0, "泉", "N2"), match(0, "水", "N5"))).toEqual(["水", "泉", "氵", "お水", "水分"]);
  });

  it("breaks a tie by the shorter label, then by id", () => {
    expect(order(match(0, "お水", "N5"), match(0, "水", "N5"))).toEqual(["水", "お水"]);
    expect(order(match(0, "b", "N5", "2"), match(0, "a", "N5", "1"))).toEqual(["a", "b"]);
  });
});

describe("levelRank", () => {
  it("puts the easiest level first and items on no level last", () => {
    expect([null, "N1", "N5", "N3"].map((l) => levelRank(l as never))).toEqual([5, 4, 0, 2]);
  });
});
