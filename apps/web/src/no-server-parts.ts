import type { Plugin } from "vite";

const EMPTY = "\0no-server-part";

/**
 * A slice's register.ts imports its server part lazily (`import("./server/index.ts")`) and the browser
 * never loads it. A production build still follows the import into node:crypto, pg and native packages,
 * so the import gets an empty module. Serving in development is untouched: the dev server never does.
 */
export const noServerParts: Plugin = {
  name: "no-server-parts",
  apply: "build",
  enforce: "pre",
  resolveId: (source, importer) => (importer?.endsWith("/register.ts") && source.startsWith("./server/") ? EMPTY : null),
  load: (id) => (id === EMPTY ? "export default undefined;" : null),
};
