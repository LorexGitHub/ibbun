import { describe, expect, it } from "vitest";
import { fill, rubricFor } from "../../src/rubrics.ts";

describe("practice-text rubric", () => {
  const rubric = rubricFor("practice-text");

  it("judges the text and the Learner's chosen type, topic and questions", () => {
    expect(rubric.version).toBe("practice-text/v1");
    expect(rubric.criteria).toEqual(["natural", "translation", "level", "type", "topic", "coherent", "questions", "safe"]);
  });

  it("fills every placeholder the reviewer is given", () => {
    const values = { kind: "dialogue", level: "N4", textType: "課題理解", length: "short", topic: "旅行", sentences: "S", questions: "Q" };
    const prompt = fill(rubric.template, values);
    expect(prompt).toContain("Passage or 聴解 task type chosen: 課題理解");
    expect(prompt).not.toMatch(/\{\{/);
    expect([...rubric.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(Object.keys(values).sort());
  });
});
