import { describe, expect, it } from "vitest";
import { packageOf, parseDuplicates, splitDuplicates, uncoveredForms } from "./gates.ts";

describe("packageOf", () => {
  it("names the workspace package of a path, or the root", () => {
    expect(packageOf("core/progress/src/record.ts")).toBe("core/progress");
    expect(packageOf("slices/learn/web/Quiz.tsx")).toBe("slices/learn");
    expect(packageOf("apps/api/src/app.ts")).toBe("apps/api");
    expect(packageOf("platform/db/src/client.ts")).toBe("platform/db");
    expect(packageOf("scripts/gates/gates.ts")).toBe(".");
    expect(packageOf("vendor/core/progress/x.ts")).toBe(".");
  });
});

const REPORT = `DUPLICATE score=0.91
  slices/learn/server/a.ts:3-13
  slices/learn/server/b.ts:3-14

DUPLICATE score=0.84
  slices/learn/server/a.ts:20-30
  slices/cram/server/c.ts:5-15
`;

describe("dryer report", () => {
  it("reads each pair with its score", () => {
    expect(parseDuplicates(REPORT)).toEqual([
      { score: "0.91", left: "slices/learn/server/a.ts:3-13", right: "slices/learn/server/b.ts:3-14" },
      { score: "0.84", left: "slices/learn/server/a.ts:20-30", right: "slices/cram/server/c.ts:5-15" },
    ]);
  });

  it("reads an empty report as no pairs", () => {
    expect(parseDuplicates("")).toEqual([]);
  });

  it("fails duplication inside a package and only reports it across packages", () => {
    const { within, across } = splitDuplicates(parseDuplicates(REPORT));
    expect(within.map((d) => d.score)).toEqual(["0.91"]);
    expect(across.map((d) => d.score)).toEqual(["0.84"]);
  });
});

const SNAPSHOT = `{:version 1
 :source "core/progress/src/record.ts"
 :namespace "core.progress.src.record"
 :outcomes {}
 :forms [{:id "defn/record"
          :kind "defn"
          :killed 3
          :survived 0
          :uncovered 1
          :sites 5}
         {:id "defn-/hidden"
          :kind "defn-"
          :killed 1
          :survived 0
          :uncovered 0
          :sites 1}]}`;

describe("mutator snapshot", () => {
  it("lists the forms with uncovered mutation sites", () => {
    expect(uncoveredForms(SNAPSHOT)).toEqual([{ source: "core/progress/src/record.ts", form: "defn/record", uncovered: 1 }]);
  });

  it("lists nothing when every site is covered", () => {
    expect(uncoveredForms(SNAPSHOT.replace(":uncovered 1", ":uncovered 0"))).toEqual([]);
  });
});
