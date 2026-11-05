// The mutator gate: runs unclebob/mutator with the arguments given, then fails
// on any form this run left with uncovered mutation sites. mutator itself
// exits 3 on a surviving mutant and 2 on a failing baseline.
// unclebob/mutator and unclebob/crapper are cloned next to the repo, or in $UB_TOOLS.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { uncoveredForms } from "./gates.ts";

const root = resolve(import.meta.dirname, "../..");
const tools = process.env.UB_TOOLS ?? resolve(root, "..");
const started = Date.now();

const run = spawnSync(join(tools, "mutator/mutator"), process.argv.slice(2), { cwd: root, stdio: "inherit" });

const snapshots = join(root, ".metrics/mutate");
const written = existsSync(snapshots)
  ? readdirSync(snapshots)
      .map((file) => join(snapshots, file))
      .filter((file) => file.endsWith(".edn") && statSync(file).mtimeMs >= started)
  : [];
const uncovered = written.flatMap((file) => uncoveredForms(readFileSync(file, "utf8")));

for (const f of uncovered) console.log(`UNCOVERED ${f.source} ${f.form}: ${f.uncovered} site(s) no test reaches`);
process.exitCode = run.status !== 0 ? (run.status ?? 1) : uncovered.length ? 1 : 0;
