// Clones crapper, dryer and mutator at the commits CI pins, and builds each one's virtualenv.
// Safe to run again. Their launchers expect `.venv/bin`, which Windows virtualenvs name `Scripts`,
// so on Windows this also links `bin` to `Scripts`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { toolsDir } from "./tools.ts";

const pins = {
  crapper: "6fd92c4c9bcc56efb64a2f8743d5a2993bcfd42d",
  dryer: "66ff6d21a42c04afcad89c78a80066176d1294b0",
  mutator: "a5a0cb803b66e0cdb8bf471b3b08af701d424a41",
};

const run = (command: string, args: string[], cwd?: string) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
};

const windows = process.platform === "win32";
mkdirSync(toolsDir, { recursive: true });

for (const [name, sha] of Object.entries(pins)) {
  const dir = join(toolsDir, name);
  if (!existsSync(dir)) {
    run("git", ["init", "-q", dir]);
    run("git", ["fetch", "-q", "--depth", "1", `https://github.com/unclebob/${name}`, sha], dir);
    run("git", ["checkout", "-q", "FETCH_HEAD"], dir);
  }
  const venv = join(dir, ".venv");
  if (!existsSync(venv)) run(windows ? "python" : "python3", ["-m", "venv", venv]);
  const python = join(venv, windows ? "Scripts/python.exe" : "bin/python");
  run(python, ["-m", "pip", "install", "-q", "-e", dir]);
  if (windows && !existsSync(join(venv, "bin"))) symlinkSync(join(venv, "Scripts"), join(venv, "bin"), "junction");
}
console.log(`Tools ready in ${toolsDir}`);
