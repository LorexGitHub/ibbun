import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { judge } from "./reviewer.ts";
import { fill, rubricFor } from "./rubrics.ts";

describe("rubrics", () => {
  it("are versioned prompt templates under rubrics/<kind>/ with their criteria listed", () => {
    expect(rubricFor("example")).toMatchObject({ version: "example/v2", criteria: ["natural", "translation", "target-sense", "reading", "blank", "answer-data"] });
    expect(rubricFor("explanation")).toMatchObject({ version: "explanation/v1", criteria: ["accurate", "natural", "level", "distinct", "reference"] });
  });

  it("uses the newest version by number, not by name", () => {
    const root = mkdtempSync(join(tmpdir(), "rubrics-"));
    mkdirSync(join(root, "k"));
    for (const [version, criterion] of [["v1", "one"], ["v10", "ten"], ["v2", "two"]] as const)
      writeFileSync(join(root, "k", `${version}.md`), `# Rubric\n\n- ${criterion}: judge it\nnot a criterion\n`);
    writeFileSync(join(root, "k", "notes.md"), "- stray: ignored\n");
    expect(rubricFor("k", root)).toMatchObject({ kind: "k", version: "k/v10", criteria: ["ten"] });
  });

  it("fills placeholders and leaves unknown ones empty", () => {
    expect(fill("a {{x}} b {{y}}", { x: "1" })).toBe("a 1 b ");
  });
});

describe("judging a reviewer answer", () => {
  const verdicts = (...pass: boolean[]) => pass.map((p, i) => ({ criterion: `c${i}`, pass: p, note: p ? "ok" : `bad ${i}` }));
  const answer = (v: ReturnType<typeof verdicts>, confidence = 1, bothReadingsAcceptable = false) => ({ verdicts: v, confidence, bothReadingsAcceptable });

  it("rejects on any failed criterion and says which", () => {
    expect(judge(["c0", "c1"], answer(verdicts(true, false)), 0.7)).toEqual({ outcome: "rejected", reason: "c1: bad 1" });
  });

  it("treats a criterion with no verdict as failed", () => {
    expect(judge(["c0", "c1"], answer(verdicts(true)), 0.7)).toEqual({ outcome: "rejected", reason: "c1: no verdict given" });
  });

  it("escalates at confidence below the minimum, not at it", () => {
    expect(judge(["c0"], answer(verdicts(true), 0.69), 0.7).outcome).toBe("escalated");
    expect(judge(["c0"], answer(verdicts(true), 0.7), 0.7).outcome).toBe("approved");
  });

  it("rejects before it escalates", () => {
    expect(judge(["c0"], answer(verdicts(false), 0, true), 0.7).outcome).toBe("rejected");
  });
});
