import { describe, expect, it } from "vitest";
import { fill, rubricFor } from "../../src/rubrics.ts";

describe("dialogue rubric", () => {
  const rubric = rubricFor("dialogue");

  it("judges register, speaker turns and audio-only questions", () => {
    expect(rubric.version).toBe("dialogue/v1");
    expect(rubric.criteria).toEqual(["spoken-register", "speaker-turns", "audio-only", "questions", "target-grammar", "length"]);
  });

  it("fixes the two speakers as 男 and 女", () => {
    expect(rubric.template).toContain("男 and 女");
  });

  it("fills every placeholder the reviewer is given", () => {
    const values = { level: "N4", grammarPoint: "G", lines: "男: a", questions: "Q", lineCount: "4" };
    const prompt = fill(rubric.template, values);
    expect(prompt).toContain("JLPT Level of the target: N4");
    expect(prompt).not.toMatch(/\{\{/);
    expect([...rubric.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(Object.keys(values).sort());
  });
});
