// The mutator gate: runs unclebob/mutator with the arguments given, then fails
// on any form this run left with uncovered mutation sites. mutator itself
// exits 3 on a surviving mutant and 2 on a failing baseline.
// unclebob/mutator and unclebob/crapper are cloned next to the repo, or in $UB_TOOLS.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { availableParallelism, freemem } from "node:os";
import { join, resolve } from "node:path";
import { uncoveredForms } from "./gates.ts";

const root = resolve(import.meta.dirname, "../..");
const tools = process.env.UB_TOOLS ?? resolve(root, "..");
const started = Date.now();

// Each mutant runs the whole Vitest suite, which peaks near 4 GB (a PGlite per test file).
// mutator defaults to one mutant per core, which runs out of memory on a 16 GB machine.
// Unless --max-workers is given, run only as many mutants as free memory holds.
const GB_PER_MUTANT = 4;
const args = process.argv.slice(2);
const workers = Math.max(1, Math.min(availableParallelism(), Math.floor(freemem() / 2 ** 30 / GB_PER_MUTANT)));
if (!args.includes("--max-workers")) args.push("--max-workers", String(workers));

const run = spawnSync(join(tools, "mutator/mutator"), args, { cwd: root, stdio: "inherit" });

const snapshots = join(root, ".metrics/mutate");
const written = existsSync(snapshots)
  ? readdirSync(snapshots)
      .map((file) => join(snapshots, file))
      .filter((file) => file.endsWith(".edn") && statSync(file).mtimeMs >= started)
  : [];
const uncovered = written.flatMap((file) => uncoveredForms(readFileSync(file, "utf8")));

for (const f of uncovered) console.log(`UNCOVERED ${f.source} ${f.form}: ${f.uncovered} site(s) no test reaches`);
process.exitCode = run.status !== 0 ? (run.status ?? 1) : uncovered.length ? 1 : 0;
