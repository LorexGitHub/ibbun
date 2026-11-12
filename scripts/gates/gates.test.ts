import { describe, expect, it } from "vitest";
import { changedFiles, mutationRuns, packageOf, parseDuplicates, rootedLcov, splitDuplicates, uncoveredForms } from "./gates.ts";

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

describe("changedFiles", () => {
  it("reads the added, edited and untracked paths out of git's NUL-separated status", () => {
    expect(changedFiles("M  slices/cram/server/api.ts\0A  docs/a b.md\0?? scripts/new.ts\0")).toEqual([
      "slices/cram/server/api.ts",
      "docs/a b.md",
      "scripts/new.ts",
    ]);
    expect(changedFiles("")).toEqual([]);
  });
});

describe("mutationRuns", () => {
  it("tests each package's mutants with that package's own tests", () => {
    expect(mutationRuns(["slices/cram/web/Picker.tsx", "slices/cram/server/api.ts", "core/progress/src/record.ts"], "vitest")).toEqual([
      { files: ["slices/cram/web/Picker.tsx", "slices/cram/server/api.ts"], testCommand: "vitest run --passWithNoTests slices/cram/" },
      { files: ["core/progress/src/record.ts"], testCommand: "vitest run --passWithNoTests core/progress/" },
    ]);
  });

  it("tests the root's mutants with the tests under scripts, as the coverage run does", () => {
    expect(mutationRuns(["scripts/gates/gates.ts", "vitest.config.ts"], "vitest")).toEqual([
      { files: ["scripts/gates/gates.ts", "vitest.config.ts"], testCommand: "vitest run --passWithNoTests scripts/" },
    ]);
  });

  it("tests a Python file's mutants with the unittest files next to it", () => {
    expect(mutationRuns(["docker/sudachi/server.py", "slices/import/server/jobs.ts"], "vitest")).toEqual([
      { files: ["docker/sudachi/server.py"], testCommand: "python3 -m unittest discover -s docker/sudachi" },
      { files: ["slices/import/server/jobs.ts"], testCommand: "vitest run --passWithNoTests slices/import/" },
    ]);
  });

  it("leaves out files that hold no code to mutate", () => {
    expect(mutationRuns(["README.md", "slices/cram/web/cram.css", ".github/workflows/ci.yml"], "vitest")).toEqual([]);
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

describe("rootedLcov", () => {
  const report = (file: string) => `TN:\nSF:${file}\nDA:47,8\nend_of_record\n`;

  it("names each file from the repo root, so two packages' server/api.ts stay apart", () => {
    expect(rootedLcov(report("server/api.ts"), "slices/reviews")).toBe(report("slices/reviews/server/api.ts"));
    expect(rootedLcov(report("server/api.ts"), "slices/cram")).toBe(report("slices/cram/server/api.ts"));
  });

  it("writes forward slashes whatever the machine wrote", () => {
    expect(rootedLcov(report("server\\api.ts"), "slices/reviews")).toBe(report("slices/reviews/server/api.ts"));
  });

  it("leaves the root's own files as they are, and renames every record", () => {
    expect(rootedLcov(report("scripts/gates/gates.ts"), ".")).toBe(report("scripts/gates/gates.ts"));
    expect(rootedLcov(report("a.ts") + report("b.ts"), "core/x")).toBe(report("core/x/a.ts") + report("core/x/b.ts"));
  });
});
