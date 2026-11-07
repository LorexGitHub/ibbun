import { describe, expect, it } from "vitest";
import { fill, rubricFor } from "../../src/rubrics.ts";

describe("reading-passage rubric", () => {
  const rubric = rubricFor("reading-passage");

  it("judges what the automatic checks cannot (batch-text.md#automatic-checks)", () => {
    expect(rubric.version).toBe("reading-passage/v1");
    expect(rubric.criteria).toEqual(["natural", "translations", "passage-type", "consistency", "level"]);
  });

  it("leaves the checks on items, Known words and length to the automatic checks", () => {
    expect(rubric.template).toContain("already passed the automatic checks");
  });

  it("fills every placeholder the reviewer is given", () => {
    const values = { level: "N4", passageType: "diary", episode: "2", episodeSummary: "S", items: "I", sentences: "T" };
    const prompt = fill(rubric.template, values);
    expect(prompt).toContain("Passage type asked for: diary");
    expect(prompt).not.toMatch(/\{\{/);
    expect([...rubric.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(Object.keys(values).sort());
  });
});
