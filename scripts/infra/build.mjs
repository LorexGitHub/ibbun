// Builds the web app into apps/web/dist, which alchemy.run.ts uploads. Alchemy bundles the
// functions itself.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const result = spawnSync("pnpm", ["--filter", "@ibbun/web", "exec", "vite", "build"], {
  cwd: resolve(import.meta.dirname, "../.."),
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exitCode = result.status ?? 1;
