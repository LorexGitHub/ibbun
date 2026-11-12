// Pure rules behind the CI gates that wrap unclebob's dryer and mutator.
// The command-line wrappers next to this file run the tools and print.
import { dirname } from "node:path/posix";

/** The workspace package a repo-relative path belongs to, like `core/progress`, or `.` for the root. */
export const packageOf = (file: string): string => {
  const match = /^(apps|core|platform|slices)\/[^/]+/.exec(file);
  return match ? match[0] : ".";
};

/** The paths in `git status --porcelain -z --no-renames`: each entry is two status letters, a space and a path. */
export const changedFiles = (status: string): string[] =>
  status
    .split("\0")
    .map((entry) => entry.slice(3))
    .filter(Boolean);

export type MutationRun = { files: string[]; testCommand: string };

const ownTests = (file: string, vitest: string): string | undefined => {
  if (file.endsWith(".py")) return `python3 -m unittest discover -s ${dirname(file)}`;
  if (!/\.tsx?$/.test(file)) return undefined;
  const dir = packageOf(file);
  return `${vitest} run --passWithNoTests ${dir === "." ? "scripts" : dir}/`;
};

/**
 * The changed files grouped by the tests that have to kill their mutants: a package's own tests, the root's
 * tests under scripts/, or the unittest files next to a Python file. Coverage is measured the same way
 * (vitest-per-package.ts), and a mutant then costs one package's tests instead of the whole suite.
 */
export const mutationRuns = (changed: string[], vitest: string): MutationRun[] => {
  const tested = changed.map((file) => ({ file, testCommand: ownTests(file, vitest) })).filter((t) => t.testCommand);
  return [...new Set(tested.map((t) => t.testCommand!))].map((testCommand) => ({
    files: tested.filter((t) => t.testCommand === testCommand).map((t) => t.file),
    testCommand,
  }));
};

export type Duplicate = { score: string; left: string; right: string };

/** Reads dryer's text report: `DUPLICATE score=0.89` followed by the two `file:start-end` locations. */
export const parseDuplicates = (report: string): Duplicate[] =>
  [...report.matchAll(/^DUPLICATE score=(\S+)\n\s+(\S+)\n\s+(\S+)$/gm)].map(([, score, left, right]) => ({
    score: score!,
    left: left!,
    right: right!,
  }));

const fileOf = (location: string) => location.replace(/:\d+-\d+$/, "");

/** Duplication inside one package fails the build; duplication across packages is only reported. */
export const splitDuplicates = (duplicates: Duplicate[]) => {
  const samePackage = (d: Duplicate) => packageOf(fileOf(d.left)) === packageOf(fileOf(d.right));
  return { within: duplicates.filter(samePackage), across: duplicates.filter((d) => !samePackage(d)) };
};

export type UncoveredForm = { source: string; form: string; uncovered: number };

/** The forms in one `.metrics/mutate/*.edn` snapshot that have mutation sites no test covers. */
export const uncoveredForms = (snapshot: string): UncoveredForm[] => {
  const source = /:source "([^"]+)"/.exec(snapshot);
  return [...snapshot.matchAll(/\{:id "([^"]+)"[^}]*?:uncovered (\d+)/g)]
    .map(([, form, count]) => ({ source: source ? source[1]! : "?", form: form!, uncovered: Number(count) }))
    .filter((f) => f.uncovered > 0);
};

/**
 * One package's LCOV with every file named from the repo root. Vitest names files from the package,
 * so `server/api.ts` of two slices would be one file to crapper and mutator, and the last report read would win.
 */
export const rootedLcov = (lcov: string, dir: string): string =>
  lcov.replace(/^SF:(.*)$/gm, (_, file: string) => `SF:${`${dir}/${file}`.replace(/\\/g, "/").replace(/^\.\//, "")}`);
