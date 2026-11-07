import { describe, expect, it } from "vitest";
import { diff } from "./diff.ts";

describe("diff", () => {
  it("finds keys added, changed and gone", () => {
    const previous = [
      { key: "1", n: 1 },
      { key: "2", n: 2 },
      { key: "3", n: 3 },
    ];
    const next = [
      { key: "1", n: 1 },
      { key: "2", n: 20 },
      { key: "4", n: 4 },
    ];
    expect(diff(previous, next)).toEqual({ added: ["4"], changed: ["2"], gone: ["3"] });
  });

  it("finds nothing between identical snapshots, nested values included", () => {
    const records = [{ key: "1", senses: [{ glosses: ["a"] }] }];
    expect(diff(records, structuredClone(records))).toEqual({ added: [], changed: [], gone: [] });
  });

  it("sees a change deep inside a record", () => {
    expect(diff([{ key: "1", senses: [{ glosses: ["a"] }] }], [{ key: "1", senses: [{ glosses: ["b"] }] }]).changed).toEqual(["1"]);
  });

  it("treats everything as added when there is no previous snapshot", () => {
    expect(diff([], [{ key: "1" }, { key: "2" }])).toEqual({ added: ["1", "2"], changed: [], gone: [] });
  });
});
