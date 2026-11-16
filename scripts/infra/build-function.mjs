// `node scripts/infra/build-function.mjs api` bundles apps/api/src/lambda.ts into apps/api/dist/lambda,
// which Terraform zips and deploys (ADR 0018). The packages a bundle cannot hold are installed
// beside it for Lambda's platform, Linux on arm64, whatever machine builds it.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { functionBuild, workerBuild } from "./bundle.mjs";

const settings = { api: functionBuild, worker: workerBuild };
const name = process.argv[2];
if (!(name in settings)) throw new Error(`usage: build-function.mjs ${Object.keys(settings).join("|")}`);
const { install, external, resolve: { alias }, moduleTypes } = settings[name];

const app = resolve(import.meta.dirname, "../../apps", name);
const out = resolve(app, "dist/lambda");
rmSync(out, { recursive: true, force: true });

// esbuild's own `alias` takes package names only; a slice imports its web part by a relative path.
const relativeAliases = {
  name: "relative-aliases",
  setup(b) {
    for (const [from, to] of Object.entries(alias)) {
      const filter = new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      b.onResolve({ filter }, () => ({ path: to }));
    }
  },
};

// @ibbun/db reads the RDS CA bundle at ../certs from its own module. The bundle sits one folder down,
// in app/, so that same path lands on certs/ inside the package (Lambda's handler is app/index.handler).
mkdirSync(resolve(out, "certs"), { recursive: true });
copyFileSync(resolve(import.meta.dirname, "../../platform/db/certs/rds-global-bundle.pem"), resolve(out, "certs/rds-global-bundle.pem"));

await build({
  entryPoints: [resolve(app, "src/lambda.ts")],
  outfile: resolve(out, "app/index.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // CommonJS dependencies inside an ES module bundle still call require.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  external: [...external, ...install],
  loader: moduleTypes,
  plugins: [relativeAliases],
  minify: true,
  sourcemap: "linked",
  logLevel: "warning",
});

// The versions installed are the ones the workspace resolved. pnpm links every package it installed,
// whichever workspace package depends on it, under node_modules/.pnpm/node_modules.
const requireFromStore = createRequire(resolve(import.meta.dirname, "../../node_modules/.pnpm/node_modules/"));
const version = (pkg) => JSON.parse(readFileSync(requireFromStore.resolve(`${pkg}/package.json`), "utf8")).version;
const dependencies = Object.fromEntries(install.map((pkg) => [pkg, version(pkg)]));
writeFileSync(resolve(out, "package.json"), JSON.stringify({ type: "module", dependencies }, null, 2));

const npm = spawnSync("npm", ["install", "--omit=dev", "--no-package-lock", "--os=linux", "--cpu=arm64", "--libc=glibc"], {
  cwd: out,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exitCode = npm.status ?? 1;
