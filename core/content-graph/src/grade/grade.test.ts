import { describe, expect, it } from "vitest";
import { grade, normalise, normaliseMeaning, similarity, type JapaneseAnswerData, type MeaningAnswerData } from "./index.ts";

const cloze: JapaneseAnswerData = {
  facet: "japanese",
  accepted: [{ id: "acc", written: "食べて", reading: "タベテ" }],
  alternates: [{ id: "alt", written: "食べまして", reading: "タベマシテ", message: "that works, but we want the casual form" }],
  knownWrong: [{ id: "wrong", written: "食べで", reading: null, message: "て, not で" }, { id: "silent", written: "たべた" }],
};

describe("normalise", () => {
  it("applies NFKC, trims, and drops one final 。！？", () => {
    expect(normalise("  ＡＢ。 ")).toBe("AB");
    expect(normalise("はい！")).toBe("はい");
    expect(normalise("はい？")).toBe("はい");
    expect(normalise("は。い")).toBe("は。い");
  });
});

describe("Japanese cloze and Kanji reading", () => {
  it("passes on the written form", () => {
    expect(grade(cloze, " 食べて。")).toEqual({ outcome: "pass", matchedAnswerId: "acc" });
  });
  it("passes on the kana reading, in hiragana when the stored reading is katakana", () => {
    expect(grade(cloze, "たべて")).toEqual({ outcome: "pass", matchedAnswerId: "acc" });
    expect(grade(cloze, "タベテ")).toEqual({ outcome: "pass", matchedAnswerId: "acc" });
  });
  it("does not treat katakana input as a hiragana accepted form", () => {
    const hiragana: JapaneseAnswerData = { facet: "japanese", accepted: [{ id: "a", written: "ねこ" }], alternates: [], knownWrong: [] };
    expect(grade(hiragana, "ねこ").outcome).toBe("pass");
    expect(grade(hiragana, "ネコ")).toEqual({ outcome: "fail" });
  });
  it("fails mixed input that matches no stored form, and near misses", () => {
    expect(grade(cloze, "食べた")).toEqual({ outcome: "fail" });
    expect(grade(cloze, "食べてる")).toEqual({ outcome: "fail" });
  });
  it("retries an alternate with its nudge", () => {
    expect(grade(cloze, "たべまして")).toEqual({ outcome: "retry", matchedAnswerId: "alt", message: "that works, but we want the casual form" });
  });
  it("fails a known wrong answer with its explanation", () => {
    expect(grade(cloze, "食べで")).toEqual({ outcome: "fail", matchedAnswerId: "wrong", message: "て, not で" });
    expect(grade(cloze, "たべた")).toEqual({ outcome: "fail", matchedAnswerId: "silent" });
  });
  it("retries input that is not an answer", () => {
    expect(grade(cloze, "  ")).toEqual({ outcome: "retry" });
    expect(grade(cloze, "たべte")).toEqual({ outcome: "retry" });
    expect(grade(cloze, "ＴＥ")).toEqual({ outcome: "retry" });
  });
});

const meaning: MeaningAnswerData = {
  facet: "meaning",
  meanings: [{ id: "m1", text: "eat" }, { id: "m2", text: "food" }],
  knownWrong: [{ id: "k1", answer: "drink", explanation: "that is 飲" }],
};

describe("Kanji meaning", () => {
  it("normalises English", () => {
    expect(normaliseMeaning(" To  Eat! ")).toBe("eat");
    expect(normaliseMeaning("the  dog's bone")).toBe("dogs bone");
    expect(normaliseMeaning("an apple")).toBe("apple");
    expect(normaliseMeaning("a cat")).toBe("cat");
    expect(normaliseMeaning("tomato")).toBe("tomato");
  });
  it("passes an exact meaning after normalisation", () => {
    expect(grade(meaning, "To eat.")).toEqual({ outcome: "pass", matchedAnswerId: "m1" });
    expect(grade(meaning, "FOOD")).toEqual({ outcome: "pass", matchedAnswerId: "m2" });
  });
  it("passes a similarity of at least 0.8 and fails below", () => {
    const long: MeaningAnswerData = { facet: "meaning", meanings: [{ id: "x", text: "abcde" }], knownWrong: [] };
    expect(grade(long, "abcdx")).toEqual({ outcome: "pass", matchedAnswerId: "x" });
    expect(grade(long, "abcxx")).toEqual({ outcome: "fail" });
  });
  it("matches the closest meaning", () => {
    const two: MeaningAnswerData = { facet: "meaning", meanings: [{ id: "a", text: "abcdx" }, { id: "b", text: "abcde" }], knownWrong: [] };
    expect(grade(two, "abcde")).toEqual({ outcome: "pass", matchedAnswerId: "b" });
    expect(grade(two, "abcdx")).toEqual({ outcome: "pass", matchedAnswerId: "a" });
    const tie: MeaningAnswerData = { facet: "meaning", meanings: [{ id: "first", text: "abcdx" }, { id: "second", text: "abcdy" }], knownWrong: [] };
    expect(grade(tie, "abcde")).toEqual({ outcome: "pass", matchedAnswerId: "first" });
  });
  it("fails a known wrong meaning even when it is similar", () => {
    expect(grade(meaning, "Drink")).toEqual({ outcome: "fail", matchedAnswerId: "k1", message: "that is 飲" });
    const close: MeaningAnswerData = { facet: "meaning", meanings: [{ id: "m", text: "abcde" }], knownWrong: [{ id: "w", answer: "abcdx", explanation: "no" }] };
    expect(grade(close, "abcdx")).toEqual({ outcome: "fail", matchedAnswerId: "w", message: "no" });
  });
  it("retries empty input and fails with no meanings", () => {
    expect(grade(meaning, " ? ")).toEqual({ outcome: "retry" });
    expect(grade({ facet: "meaning", meanings: [], knownWrong: [] }, "eat")).toEqual({ outcome: "fail" });
  });
  it("computes similarity", () => {
    expect(similarity("", "")).toBe(1);
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "")).toBe(0);
    expect(similarity("kitten", "sitting")).toBeCloseTo(1 - 3 / 7);
    expect(similarity("ab", "ba")).toBe(0);
    expect(similarity("abcd", "abd")).toBe(0.75);
    expect(similarity("abd", "abcd")).toBe(0.75);
  });
});

describe("dictation", () => {
  const dictation = {
    facet: "dictation" as const,
    tokens: [
      { surface: "私", reading: "ワタシ" },
      { surface: "は", reading: "ハ" },
      { surface: "コーヒー", reading: "コーヒー" },
      { surface: "を", reading: "ヲ" },
      { surface: "飲む", reading: "ノム" },
      { surface: "。", reading: "。" },
    ],
  };
  it("passes surfaces, readings, or any mix, ignoring punctuation and spaces", () => {
    expect(grade(dictation, "私はコーヒーを飲む。")).toEqual({ outcome: "pass" });
    expect(grade(dictation, "わたしは こーひーを、のむ")).toEqual({ outcome: "pass" });
    expect(grade(dictation, "ワタシハコーヒーヲノム")).toEqual({ outcome: "pass" });
  });
  it("accepts a token that has only a surface", () => {
    const one = { facet: "dictation" as const, tokens: [{ surface: "猫", reading: "" }, { surface: "、", reading: "" }] };
    expect(grade(one, "猫")).toEqual({ outcome: "pass" });
  });
  it("is all or nothing", () => {
    expect(grade(dictation, "私はコーヒーを飲む飲む")).toEqual({ outcome: "fail" });
    expect(grade(dictation, "私はコーヒーを")).toEqual({ outcome: "fail" });
    expect(grade(dictation, "私がコーヒーを飲む")).toEqual({ outcome: "fail" });
  });
  it("retries input that is not an answer", () => {
    expect(grade(dictation, "。")).toEqual({ outcome: "retry" });
    expect(grade(dictation, "watashi")).toEqual({ outcome: "retry" });
  });
});

describe("comprehension", () => {
  const question = { facet: "comprehension" as const, answer: 2, choiceCount: 4 };
  it("passes the correct option and fails any other", () => {
    expect(grade(question, 2)).toEqual({ outcome: "pass" });
    expect(grade(question, 0)).toEqual({ outcome: "fail" });
    expect(grade(question, 3)).toEqual({ outcome: "fail" });
  });
  it("retries a choice that is not an option", () => {
    expect(grade(question, -1)).toEqual({ outcome: "retry" });
    expect(grade(question, 4)).toEqual({ outcome: "retry" });
    expect(grade(question, 1.5)).toEqual({ outcome: "retry" });
  });
});
