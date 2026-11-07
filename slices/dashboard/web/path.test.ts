import { describe, expect, it } from "vitest";
import { levelNote, pathRows, percentKnown } from "./path.ts";

const level = (name: "N5" | "N4" | "N3" | "N2" | "N1", known: number, total: number) => ({ level: name, known, total });

describe("pathRows", () => {
  const rows = pathRows([level("N5", 92, 100), level("N4", 41, 100), level("N3", 6, 100), level("N2", 0, 100), level("N1", 0, 100)]);

  it("marks a settled level done, the first unsettled one now, and steps the rest away", () => {
    expect(rows.map((r) => r.stage)).toEqual(["done", "now", "next", "far", "farther"]);
  });

  it("writes each level's note as the mock does", () => {
    expect(rows.map(levelNote)).toEqual(["92% · 100 items", "41% · 100 items", "6%", "not started", "not started"]);
  });

  it("makes every level done when all are settled", () => {
    const all = pathRows([level("N5", 95, 100), level("N4", 100, 100)]);
    expect(all.map((r) => r.stage)).toEqual(["done", "done"]);
  });

  it("treats exactly 90% as settled", () => {
    expect(pathRows([level("N5", 90, 100), level("N4", 0, 10)]).map((r) => r.stage)).toEqual(["done", "now"]);
  });

  it("rounds the share down and reads an empty level as 0%", () => {
    expect(percentKnown(level("N5", 2, 3))).toBe(66);
    expect(percentKnown(level("N4", 0, 0))).toBe(0);
  });
});
