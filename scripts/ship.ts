// Lands the current branch on main: rebase onto origin/main, run the local gates, push to main.
// If someone else lands first the push is rejected, so it rebases and gates again, up to three times.
// Afterwards, close the issue and remove the worktree (see AGENTS.md).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (command: string, args: string[]) =>
  spawnSync(command, args, { cwd: root, stdio: "inherit", shell: command === "pnpm" }).status === 0;

for (let attempt = 1; attempt <= 3; attempt++) {
  if (!run("git", ["fetch", "-q", "origin", "main"])) process.exit(1);
  if (!run("git", ["rebase", "origin/main"])) {
    console.error("Rebase hit conflicts. Resolve them, `git rebase --continue`, then run `pnpm ship` again.");
    process.exit(1);
  }
  if (!run("pnpm", ["gate:local"])) process.exit(1);
  if (run("git", ["push", "origin", "HEAD:main"])) {
    console.log("\nLanded on main. Now close the issue and remove this worktree.");
    process.exit(0);
  }
  console.error(`\nmain moved while the gates ran (attempt ${attempt} of 3). Rebasing and gating again.`);
}
console.error("Gave up after three attempts.");
process.exit(1);
