import { describe, expect, it } from "vitest";
import { diffDictation } from "../server/diff.ts";

const SENTENCE = [
  { surface: "パン", reading: "パン" },
  { surface: "を", reading: "ヲ" },
  { surface: "食べる", reading: "タベル" },
  { surface: "。", reading: "。" },
];
const statuses = (typed: string) => diffDictation(SENTENCE, typed).tokens.map((t) => t.status);

describe("dictation diff", () => {
  it("marks every token correct when the Learner spelled the Sentence", () => {
    expect(statuses("パンを食べる")).toEqual(["correct", "correct", "correct"]);
  });

  it("takes either the surface form or the reading for a token", () => {
    expect(statuses("パンをたべる")).toEqual(["correct", "correct", "correct"]);
  });

  it("marks a token wrong and says what was typed in its place", () => {
    const { tokens } = diffDictation(SENTENCE, "パンを食べた");
    expect(tokens.map((t) => t.status)).toEqual(["correct", "correct", "wrong"]);
    expect(tokens[2]).toMatchObject({ surface: "食べる", reading: "タベル", typed: "食べた" });
  });

  it("marks tokens the Learner left out as missing, without blaming the ones after", () => {
    expect(statuses("パン食べる")).toEqual(["correct", "missing", "correct"]);
    expect(statuses("パンを")).toEqual(["correct", "correct", "missing"]);
  });

  it("marks every token missing for an empty answer", () => {
    expect(statuses("")).toEqual(["missing", "missing", "missing"]);
  });

  it("ignores punctuation and spaces, and skips punctuation tokens", () => {
    const { tokens } = diffDictation(SENTENCE, "パン を、食べる。");
    expect(tokens.map((t) => t.surface)).toEqual(["パン", "を", "食べる"]);
    expect(tokens.every((t) => t.status === "correct")).toBe(true);
  });

  it("reports text typed after the last token", () => {
    expect(diffDictation(SENTENCE, "パンを食べるよ")).toMatchObject({ extra: "よ" });
    expect(diffDictation(SENTENCE, "パンを食べる").extra).toBe("");
  });

  it("counts katakana typed for a hiragana reading as wrong, but hiragana for a katakana reading as right", () => {
    expect(statuses("ぱんをたべる")).toEqual(["correct", "correct", "correct"]);
    expect(diffDictation([{ surface: "ひと", reading: "ひと" }], "ヒト").tokens[0]!.status).toBe("wrong");
  });
});
