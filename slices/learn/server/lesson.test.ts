import { describe, expect, it } from "vitest";
import type { Example, Word } from "@ibbun/content-graph";
import { lessonOf } from "./lesson.ts";
import type { TaughtPage } from "./prompt.ts";

const example = { sentence: { text: "ねこがいる。", translationEn: null } } as Example;
const pageOf = (item: object) => ({ item, examples: [], links: [], attribution: {} }) as unknown as TaughtPage;

const word = (over: Partial<Word> = {}) =>
  pageOf({
    id: "w",
    type: "word",
    forms: [{ id: "f", text: "猫" }],
    readings: [{ id: "r", text: "ねこ", pitchAccent: null }],
    senses: [{ id: "s", partsOfSpeech: ["noun", "common"], glosses: ["cat", "feline"], japaneseExplanation: null }],
    ...over,
  });

describe("a lesson", () => {
  it("teaches a Word by its first written form and reading, one meaning per sense", () => {
    expect(lessonOf(word(), example, "ペット。")).toMatchObject({
      type: "word",
      title: "猫",
      reading: "ねこ",
      meanings: ["cat; feline"],
      details: [{ label: "Part of speech", value: "noun / common" }],
      japaneseExplanation: "ペット。",
      example: { japanese: "ねこがいる。", translationEn: null },
    });
  });

  it("teaches a Word with no kanji form by its reading", () => {
    expect(lessonOf(word({ forms: [] }), example, null).title).toBe("ねこ");
  });

  it("teaches a Kanji with its readings and stroke count, leaving out a reading it does not have", () => {
    const kanji = pageOf({ id: "k", type: "kanji", literal: "猫", meanings: ["cat"], onReadings: ["ビョウ"], kunReadings: [], strokeCount: 11 });
    expect(lessonOf(kanji, example, null)).toMatchObject({
      title: "猫",
      reading: null,
      meanings: ["cat"],
      details: [{ label: "On'yomi", value: "ビョウ" }, { label: "Strokes", value: "11" }],
    });
  });

  it("teaches a Grammar Point with its formation and register, and its notes when it has some", () => {
    const point = (notes: string | null) =>
      pageOf({ id: "g", type: "grammar_point", title: "〜がいる", meaning: "there is", formation: ["N + がいる", "N + が + いる"], register: "neutral", notes });
    expect(lessonOf(point(null), example, null).details).toEqual([
      { label: "Formation", value: "N + がいる / N + が + いる" },
      { label: "Register", value: "neutral" },
    ]);
    expect(lessonOf(point("for living things"), example, null).details.at(-1)).toEqual({ label: "Notes", value: "for living things" });
  });
});
