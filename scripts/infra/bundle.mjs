import { resolve } from "node:path";

/**
 * Bundler settings shared by the API and worker functions. Alchemy keeps these in its state, so they
 * stay plain data: a plugin's closures would not survive. A slice's register.ts imports its web part
 * lazily and a function never loads it, so it gets an empty module, as does any stylesheet the server
 * graph still reaches. The native argon2 binding ships as a .node file, so Alchemy installs it for
 * Lambda's platform instead of bundling it.
 */
const empty = resolve(import.meta.dirname, "empty.mjs");

export const functionBuild = {
  install: ["@node-rs/argon2"],
  // pg's optional native binding is never installed.
  external: ["pg-native"],
  resolve: { alias: { "./web/index.ts": empty, "./web.tsx": empty } },
  moduleTypes: { ".css": "empty" },
};

/** The worker also encodes Ogg Opus. opusscript reads its WebAssembly from __dirname, which a bundle does not have, so it is installed too. */
export const workerBuild = { ...functionBuild, install: [...functionBuild.install, "opusscript"] };
