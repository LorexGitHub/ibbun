// The dryer gate: one dryer run over the whole workspace at 0.8. A pair inside
// one package fails the build; a pair across packages is printed and passes
// (slices copy small logic until a third use; architecture.md#changing-the-core).
// unclebob/dryer lives in $UB_TOOLS (see tools.ts).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDuplicates, splitDuplicates } from "./gates.ts";
import { tool, toolEnv } from "./tools.ts";

const root = resolve(import.meta.dirname, "../..");
const dirs = ["apps", "core", "platform", "slices", "scripts"].filter((dir) => existsSync(join(root, dir)));

const dryer = tool("dryer");
const run = spawnSync(dryer.command, [...dryer.prefix, "--threshold", "0.8", ...dirs], {
  cwd: root,
  env: toolEnv,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
if (run.status !== 0) throw new Error(`dryer exited ${run.status}`);

const { within, across } = splitDuplicates(parseDuplicates(run.stdout));
const show = (title: string, pairs: typeof within) =>
  console.log(`${title}: ${pairs.length}\n${pairs.map((d) => `  ${d.score}  ${d.left}  ${d.right}`).join("\n")}`);
show("Duplication across packages (reported, not failed)", across);
show("Duplication inside a package (fails)", within);
process.exitCode = within.length ? 1 : 0;
