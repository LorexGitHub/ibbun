// The mutator gate: runs unclebob/mutator with the arguments given, then fails
// on any form this run left with uncovered mutation sites. mutator itself
// exits 3 on a surviving mutant and 2 on a failing baseline.
// With --changed and no --test-command it runs mutator once per group of changed
// files, each against that group's own tests (mutationRuns in gates.ts).
// unclebob/mutator and unclebob/crapper live in $UB_TOOLS (see tools.ts).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { availableParallelism, freemem } from "node:os";
import { join, resolve } from "node:path";
import { changedFiles, mutationRuns, uncoveredForms } from "./gates.ts";
import { tool, toolEnv } from "./tools.ts";

const root = resolve(import.meta.dirname, "../..");
const started = Date.now();

// A mutant's test run peaks near 4 GB (a PGlite per test file).
// mutator defaults to one mutant per core, which runs out of memory on a 16 GB machine.
// Unless --max-workers is given, run only as many mutants as free memory holds.
const GB_PER_MUTANT = 4;
const args = process.argv.slice(2);
const workers = Math.max(1, Math.min(availableParallelism(), Math.floor(freemem() / 2 ** 30 / GB_PER_MUTANT)));
if (!args.includes("--max-workers")) args.push("--max-workers", String(workers));

// Run the JS entry through node: .bin/vitest is a shell script on Windows.
const vitest = `node "${join(root, "node_modules/vitest/vitest.mjs")}"`;
// The same list mutator's --changed reads.
const status = spawnSync("git", ["status", "--porcelain", "-z", "--no-renames", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
const scoped = args.includes("--changed") && !args.includes("--test-command");
// mutator takes an argument that names no existing path as a filter on --changed, so "/<file>" narrows a run to its group.
const runs = scoped
  ? mutationRuns(changedFiles(status.stdout), vitest).map((run) => ["--test-command", run.testCommand, ...run.files.map((file) => `/${file}`)])
  : [[]];

const mutator = tool("mutator");
let failure = 0;
for (const extra of runs) {
  const run = spawnSync(mutator.command, [...mutator.prefix, ...args, ...extra], { cwd: root, env: toolEnv, stdio: "inherit" });
  failure ||= run.status ?? 1;
}

const snapshots = join(root, ".metrics/mutate");
const written = existsSync(snapshots)
  ? readdirSync(snapshots)
      .map((file) => join(snapshots, file))
      .filter((file) => file.endsWith(".edn") && statSync(file).mtimeMs >= started)
  : [];
const uncovered = written.flatMap((file) => uncoveredForms(readFileSync(file, "utf8")));

for (const f of uncovered) console.log(`UNCOVERED ${f.source} ${f.form}: ${f.uncovered} site(s) no test reaches`);
process.exitCode = failure || (uncovered.length ? 1 : 0);
