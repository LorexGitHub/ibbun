// The dryer gate: one dryer run over the whole workspace at 0.8. A pair inside
// one package fails the build; a pair across packages is printed and passes
// (slices copy small logic until a third use; architecture.md#changing-the-core).
// unclebob/dryer is cloned next to the repo, or at $UB_TOOLS/dryer.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDuplicates, splitDuplicates } from "./gates.ts";

const root = resolve(import.meta.dirname, "../..");
const tools = process.env.UB_TOOLS ?? resolve(root, "..");
const dirs = ["apps", "core", "platform", "slices", "scripts"].filter((dir) => existsSync(join(root, dir)));

const run = spawnSync(join(tools, "dryer/dryer"), ["--threshold", "0.8", ...dirs], {
  cwd: root,
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
