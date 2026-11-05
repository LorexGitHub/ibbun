// Pure rules behind the CI gates that wrap unclebob's dryer and mutator.
// The command-line wrappers next to this file run the tools and print.

/** The workspace package a repo-relative path belongs to, like `core/progress`, or `.` for the root. */
export const packageOf = (file: string): string => {
  const match = /^(apps|core|platform|slices)\/[^/]+/.exec(file);
  return match ? match[0] : ".";
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
