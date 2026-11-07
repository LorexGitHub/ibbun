// dependency-cruiser over every workspace group that exists. A script rather than a shell
// one-liner in package.json, so it also runs where pnpm uses cmd.exe.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const dirs = ["apps", "core", "platform", "slices"].filter((dir) => existsSync(join(root, dir)));
const bin = join(root, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs");

const run = spawnSync("node", [bin, "--config", ".dependency-cruiser.cjs", ...dirs], { cwd: root, stdio: "inherit" });
process.exitCode = run.status ?? 1;
