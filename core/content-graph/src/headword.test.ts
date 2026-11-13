import { describe, expect, it } from "vitest";
import { headword } from "./read.ts";

const forms = (...texts: string[]) => texts.map((text, i) => ({ id: `f${i}`, text }));
const readings = (...texts: string[]) => texts.map((text, i) => ({ id: `r${i}`, text }));

describe("headword", () => {
  it("shows the first written form of a Word", () => {
    expect(headword({ usuallyKana: false, forms: forms("食べる", "喰べる"), readings: readings("たべる") })).toBe("食べる");
  });

  it("shows the reading of a usually-kana Word, not its rare kanji spelling", () => {
    expect(headword({ usuallyKana: true, forms: forms("此れ"), readings: readings("これ", "コレ") })).toBe("これ");
  });

  it("falls back to the reading when a Word has no written form", () => {
    expect(headword({ usuallyKana: false, forms: [], readings: readings("ある") })).toBe("ある");
  });

  it("is empty for a Word with neither form nor reading", () => {
    expect(headword({ usuallyKana: true, forms: [], readings: [] })).toBe("");
  });
});
