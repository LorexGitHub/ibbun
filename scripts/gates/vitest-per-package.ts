// Runs Vitest once in each workspace package, then once for the root's own
// tests (scripts/). With --coverage each run writes LCOV to
// target/coverage/typescript/<group>__<package>/, where crapper and mutator
// read it with --use-existing-coverage, each file named from the repo root.
// Exits 1 when any package fails.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rootedLcov } from "./gates.ts";

const root = resolve(import.meta.dirname, "../..");
// Run the JS entry through node: .bin/vitest is a shell script on Windows.
const vitest = join(root, "node_modules/vitest/vitest.mjs");
const coverage = process.argv.includes("--coverage");

const packages = ["apps", "core", "platform", "slices"]
  .flatMap((group) => (existsSync(join(root, group)) ? readdirSync(join(root, group)).map((name) => `${group}/${name}`) : []))
  .filter((dir) => existsSync(join(root, dir, "package.json")));

// The root run covers only scripts/: each package's coverage comes from its own tests.
const runs: [string, string[]][] = [
  ...packages.map((dir): [string, string[]] => [dir, []]),
  [".", ["scripts", "--coverage.include=scripts/**"]],
];

const rooted = (slug: string, dir: string) => {
  const file = join(root, "target/coverage/typescript", slug, "lcov.info");
  if (existsSync(file)) writeFileSync(file, rootedLcov(readFileSync(file, "utf8"), dir));
};

const failed: string[] = [];
for (const [dir, filters] of runs) {
  const slug = dir === "." ? "root" : dir.replace("/", "__");
  const report = ["--coverage", "--coverage.reporter=lcovonly", `--coverage.reportsDirectory=${join(root, "target/coverage/typescript", slug)}`];
  const args = ["run", "--passWithNoTests", ...(coverage ? report : []), ...(coverage ? filters : filters.slice(0, 1))];
  console.log(`\n=== vitest: ${dir}`);
  if (spawnSync("node", [vitest, ...args], { cwd: join(root, dir), stdio: "inherit" }).status !== 0) failed.push(dir);
  if (coverage) rooted(slug, dir);
}

console.log(failed.length ? `\nFailed: ${failed.join(", ")}` : "\nEvery package passed.");
process.exitCode = failed.length ? 1 : 0;
