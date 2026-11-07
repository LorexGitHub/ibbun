// Where unclebob's crapper, dryer and mutator live, and how to run them.
// By default they are cloned next to the repo, as ub-mode and CI expect (mutator needs ../crapper).
// Set $UB_TOOLS to use another folder. scripts/gates/setup-tools.ts creates the clones.
import { join, resolve } from "node:path";

export const toolsDir = process.env.UB_TOOLS ?? resolve(import.meta.dirname, "../../..");

/** The launchers are POSIX shell scripts, so run them through `sh` on every OS. */
export const tool = (name: "crapper" | "dryer" | "mutator") => ({ command: "sh", prefix: [join(toolsDir, name, name)] });

/** The tools print non-ASCII text, which Windows consoles reject unless Python runs in UTF-8 mode. */
export const toolEnv = { ...process.env, PYTHONUTF8: "1" };
