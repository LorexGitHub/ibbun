import { describe, expect, it } from "vitest";
import type { QuestionFacet } from "../contract.ts";
import { checkLocally, retryMessage, revealedAnswer } from "./check.ts";

const japanese: QuestionFacet = {
  facet: "japanese",
  label: "The missing Japanese",
  answerData: {
    facet: "japanese",
    accepted: [{ id: "a", written: "山", reading: "やま" }],
    alternates: [{ id: "b", written: "お山", message: "That works, but we want the plain form." }],
    knownWrong: [],
  },
};
const meaning: QuestionFacet = {
  facet: "meaning",
  label: "Meaning",
  answerData: { facet: "meaning", meanings: [{ id: "m0", text: "mountain" }, { id: "m1", text: "hill" }], knownWrong: [] },
};

describe("checkLocally", () => {
  it("grades each facet with its own input", () => {
    expect(checkLocally([japanese, meaning], { japanese: "やま", meaning: "river" }).map((r) => [r.facet, r.outcome])).toEqual([
      ["japanese", "pass"],
      ["meaning", "fail"],
    ]);
  });

  it("treats a facet with no input as not yet answered", () => {
    expect(checkLocally([japanese], {})[0]).toMatchObject({ outcome: "retry" });
  });
});

describe("retryMessage", () => {
  it("is null when nothing needs another try", () => {
    expect(retryMessage(checkLocally([japanese], { japanese: "やま" }))).toBeNull();
  });

  it("shows an alternate's nudge", () => {
    expect(retryMessage(checkLocally([japanese], { japanese: "お山" }))).toBe("That works, but we want the plain form.");
  });

  it("explains an input that is not an answer", () => {
    expect(retryMessage(checkLocally([japanese], { japanese: "yama?" }))).toMatch(/Type your answer in Japanese/);
  });
});

describe("revealedAnswer", () => {
  it("reveals the first accepted written form", () => {
    expect(revealedAnswer(japanese.answerData)).toBe("山");
    expect(revealedAnswer({ facet: "japanese", accepted: [], alternates: [], knownWrong: [] })).toBe("");
  });

  it("reveals every meaning", () => {
    expect(revealedAnswer(meaning.answerData)).toBe("mountain, hill");
  });

  it("reveals nothing for the facets Cram never asks", () => {
    expect(revealedAnswer({ facet: "comprehension", answer: 0, choiceCount: 4 })).toBe("");
  });
});
