// Where unclebob's crapper, dryer and mutator live, and how to run them.
// Set $UB_TOOLS to a folder holding the three clones side by side (mutator needs ../crapper).
// scripts/gates/setup-tools.ts creates it.
import { homedir } from "node:os";
import { join } from "node:path";

export const toolsDir = process.env.UB_TOOLS ?? join(homedir(), ".ub-tools");

/** The launchers are POSIX shell scripts, so run them through `sh` on every OS. */
export const tool = (name: "crapper" | "dryer" | "mutator") => ({ command: "sh", prefix: [join(toolsDir, name, name)] });

/** The tools print non-ASCII text, which Windows consoles reject unless Python runs in UTF-8 mode. */
export const toolEnv = { ...process.env, PYTHONUTF8: "1" };
