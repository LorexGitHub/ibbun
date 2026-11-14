// Bundles the Lambda entry point (src/lambda.ts) into dist/lambda/: index.mjs, the
// one file the function runs, and a package.json naming the native packages it
// still imports. Node on Lambda cannot strip types inside node_modules, and the
// workspace packages are TypeScript, so everything else is bundled.
// Install those natives for Lambda's platform in dist/lambda before zipping:
//   npm install --omit=dev --os=linux --cpu=arm64 --libc=glibc
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
// Ships a platform-specific .node binding, so it is installed, not bundled.
const native = ["@node-rs/argon2"];
const require = createRequire(here("../../core/learner/package.json"));
const version = (name) => JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version;

// A slice's register.ts imports its web part lazily. The API never loads it, so it stays out of the bundle.
const noWebParts = {
  name: "no-web-parts",
  setup(b) {
    b.onResolve({ filter: /^\.\/web\/index\.tsx?$/ }, ({ path }) => ({ path, namespace: "no-web-part" }));
    b.onLoad({ filter: /.*/, namespace: "no-web-part" }, () => ({ contents: "export {};" }));
  },
};

await build({
  entryPoints: [here("src/lambda.ts")],
  outfile: here("dist/lambda/index.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: true,
  sourcemap: "linked",
  // pg's optional native binding is never installed.
  external: [...native, "pg-native"],
  // Bundled CommonJS still calls require.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [noWebParts],
  logLevel: "info",
});

const dependencies = Object.fromEntries(native.map((name) => [name, version(name)]));
writeFileSync(here("dist/lambda/package.json"), `${JSON.stringify({ type: "module", private: true, dependencies }, null, 2)}\n`);
