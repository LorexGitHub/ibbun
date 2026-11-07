import { describe, expect, it } from "vitest";
import { fill, rubricFor } from "../../src/rubrics.ts";

describe("proposals rubric", () => {
  const rubric = rubricFor("proposals");

  it("judges both proposal types on meaning, not form", () => {
    expect(rubric.version).toBe("proposals/v1");
    expect(rubric.criteria).toEqual(["one-meaning", "variant-only", "sense-fit", "best-candidate", "no-match", "reason"]);
  });

  it("names the one-meaning rule and the ように example", () => {
    expect(rubric.template).toContain("two Grammar Points (ように \"so that\" and ように \"like\")");
  });

  it("fills every placeholder the reviewer is given", () => {
    const values = { proposalType: "merge", confidence: "high", reason: "same", proposed: "P", candidates: "C" };
    const prompt = fill(rubric.template, values);
    expect(prompt).toContain("Type: merge");
    expect(prompt).not.toMatch(/\{\{/);
    expect([...rubric.template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()).toEqual(Object.keys(values).sort());
  });
});
