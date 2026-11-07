// Every merge gate except Playwright, run on this machine against the commits since origin/main.
// This is the check that replaced the slow CI job: `pnpm gate:local`, or `pnpm ship` to run it and then push.
// Run it from a clean checkout of your branch. First time on a machine: `node scripts/gates/setup-tools.ts`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tool, toolEnv, toolsDir } from "./tools.ts";

const root = resolve(import.meta.dirname, "../..");

const spawn = (command: string, args: string[], stdio: "inherit" | "pipe") =>
  spawnSync(command, args, { cwd: root, env: toolEnv, encoding: "utf8", shell: command === "pnpm", stdio });

const git = (...args: string[]) => String(spawn("git", args, "pipe").stdout).trim();

const step = (name: string, command: string, args: string[]) => {
  console.log(`\n=== ${name}`);
  const failed = spawn(command, args, "inherit").status !== 0;
  if (failed) throw new Error(`GATE FAILED: ${name}`);
};

const crapper = (args: string[]) => {
  const t = tool("crapper");
  step("crapper --changed (fails at CRAP 10 or above)", t.command, [...t.prefix, ...args]);
};

const main = () => {
  if (!existsSync(join(toolsDir, "mutator", "mutator"))) {
    throw new Error(`crapper, dryer and mutator are missing from ${toolsDir}. Run: node scripts/gates/setup-tools.ts`);
  }
  if (git("status", "--porcelain")) throw new Error("Commit or discard your changes first: the gates check committed work.");

  git("fetch", "-q", "origin", "main");
  const head = git("rev-parse", "HEAD");
  const base = git("merge-base", "origin/main", "HEAD");

  step("typecheck", "pnpm", ["typecheck"]);
  step("dependency-cruiser", "pnpm", ["depcruise"]);
  step("vitest per package, with coverage", "pnpm", ["test:packages", "--coverage"]);

  // crapper and mutator read --changed from `git status`. A soft reset to the base leaves every
  // file this branch adds or edits staged. The finally block puts HEAD back.
  git("reset", "-q", "--soft", base);
  try {
    crapper(["--changed", "--use-existing-coverage", "--threshold", "9.99"]);
    step("dryer", "pnpm", ["gate:dryer"]);
    step("mutator --changed", "pnpm", [
      "gate:mutator", "--changed", "--use-existing-coverage",
      "--test-command", `node ${join(root, "node_modules/vitest/vitest.mjs")} run --passWithNoTests`,
    ]);
  } finally {
    git("reset", "-q", "--soft", head);
  }
  console.log("\nEvery local gate passed.");
};

try {
  main();
} catch (error) {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
}
