// Proves every dependency rule in .dependency-cruiser.cjs fires. Builds a small
// workspace in a temp dir, with node_modules links the way pnpm makes them,
// runs the real depcruise CLI and config on it, and checks which file broke
// which rule. Files named ok-* must break nothing.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
const BETTER_AUTH = "node_modules/.pnpm/better-auth@1.0.0/node_modules/better-auth";

type Pkg = { exports: Record<string, string>; files: Record<string, string>; deps?: string[] };

const pkg = (exports: Record<string, string>, files: Record<string, string>, deps: string[] = []): Pkg => ({
  exports,
  files,
  deps,
});

const WORKSPACE: Record<string, Pkg> = {
  "core/content-graph": pkg(
    { ".": "./src/index.ts", "./authoring": "./src/authoring/index.ts" },
    {
      "src/index.ts": "export const read = 1;",
      "src/authoring/index.ts": "export const write = 1;",
      "src/internal.ts": "export const hidden = 1;",
      "db/tables.ts": "export const studyItems = 1;",
      "src/violates-core-dependency-direction.ts": 'import { record } from "@fx/progress";\nexport const x = record;',
    },
    ["@fx/progress"],
  ),
  "core/progress": pkg(
    { ".": "./src/index.ts" },
    {
      "src/index.ts": "export const record = 1;",
      "src/ok-imports-content-graph.ts": 'import { read } from "@fx/content-graph";\nexport const x = read;',
      "src/violates-core-imports-slice.ts": 'import { learn } from "../../../slices/learn/src/index.ts";\nexport const x = learn;',
    },
    ["@fx/content-graph"],
  ),
  "core/learning-path": pkg(
    { ".": "./src/index.ts" },
    {
      "src/index.ts": 'import { read } from "@fx/content-graph";\nimport { record } from "@fx/progress";\nexport const next = [read, record];',
    },
    ["@fx/content-graph", "@fx/progress"],
  ),
  "platform/nlp": pkg({ ".": "./src/index.ts" }, { "src/index.ts": "export const tokenize = 1;" }),
  "slices/learn": pkg(
    { "./register": "./register.ts" },
    {
      "register.ts": 'import { learn } from "./src/index.ts";\nexport default learn;',
      "src/index.ts": 'import { read } from "@fx/content-graph";\nexport const learn = read;',
      "src/violates-slice-imports-another-slice.ts": 'import { cram } from "../../cram/src/index.ts";\nexport const x = cram;',
      "src/violates-package-internals.ts": 'import { hidden } from "../../../core/content-graph/src/internal.ts";\nexport const x = hidden;',
      "src/violates-unresolvable.ts": 'import { hidden } from "@fx/content-graph/src/internal.ts";\nexport const x = hidden;',
      "src/violates-learner-slice-imports-admin-only-authoring.ts":
        'import { write } from "@fx/content-graph/authoring";\nexport const x = write;',
      "src/violates-learner-slice-imports-admin-only-nlp.ts": 'import { tokenize } from "@fx/nlp";\nexport const x = tokenize;',
      "src/violates-learner-slice-imports-admin-only-better-auth.ts":
        'import { betterAuth } from "better-auth";\nexport const x = betterAuth;',
      "src/violates-foreign-schema.ts": 'import { studyItems } from "../../../core/content-graph/db/tables.ts";\nexport const x = studyItems;',
    },
    ["@fx/content-graph", "@fx/nlp", "better-auth"],
  ),
  "slices/cram": pkg({ ".": "./src/index.ts" }, { "src/index.ts": "export const cram = 1;" }),
  "slices/import": pkg(
    { ".": "./src/index.ts" },
    {
      "src/index.ts": "export const run = 1;",
      "src/ok-admin-slice-imports-authoring-and-nlp.ts":
        'import { write } from "@fx/content-graph/authoring";\nimport { tokenize } from "@fx/nlp";\nexport const x = [write, tokenize];',
    },
    ["@fx/content-graph", "@fx/nlp"],
  ),
  "apps/api": pkg(
    {},
    { "src/ok-imports-slice-register.ts": 'import learn from "../../../slices/learn/register.ts";\nexport const x = learn;' },
  ),
};

const shortName = (dir: string) => `@fx/${dir.split("/")[1]}`;

const writeFiles = async (root: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
};

const linkDeps = async (root: string, dir: string, deps: string[]) => {
  for (const dep of deps) {
    const from = join(root, dir, "node_modules", dep);
    await mkdir(dirname(from), { recursive: true });
    const target = dep === "better-auth" ? join(root, BETTER_AUTH) : join(root, workspaceDir(dep));
    await symlink(target, from, "junction");
  }
};

const workspaceDir = (name: string) => Object.keys(WORKSPACE).find((dir) => shortName(dir) === name)!;

const buildWorkspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "depcruise-"));
  await writeFiles(root, {
    [`${BETTER_AUTH}/package.json`]: JSON.stringify({ name: "better-auth", exports: { ".": "./index.js" } }),
    [`${BETTER_AUTH}/index.js`]: "export const betterAuth = 1;",
  });
  for (const [dir, { exports, files, deps }] of Object.entries(WORKSPACE)) {
    await writeFiles(join(root, dir), {
      ...files,
      "package.json": JSON.stringify({ name: shortName(dir), type: "module", exports }),
    });
    await linkDeps(root, dir, deps ?? []);
  }
  return root;
};

type Violation = { from: string; to: string; rule: { name: string } };

const cruise = async (root: string): Promise<Violation[]> => {
  const bin = join(ROOT, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs");
  const args = [bin, "--config", join(ROOT, ".dependency-cruiser.cjs"), "--output-type", "json", "apps", "core", "platform", "slices"];
  const { stdout } = await run(process.execPath, args, { cwd: root }).catch((error) => error);
  return JSON.parse(stdout).summary.violations;
};

describe("dependency rules", () => {
  let violations: Violation[];
  beforeAll(async () => {
    violations = await cruise(await buildWorkspace());
  }, 60_000);

  const brokenBy = (rule: string) => violations.filter((v) => v.rule.name === rule).map((v) => v.from);

  it.each([
    ["slice-imports-another-slice", ["slices/learn/src/violates-slice-imports-another-slice.ts"]],
    [
      "package-internals",
      [
        "core/progress/src/violates-core-imports-slice.ts",
        "slices/learn/src/violates-foreign-schema.ts",
        "slices/learn/src/violates-package-internals.ts",
        "slices/learn/src/violates-slice-imports-another-slice.ts",
      ],
    ],
    ["unresolvable", ["slices/learn/src/violates-unresolvable.ts"]],
    [
      "learner-slice-imports-admin-only",
      [
        "slices/learn/src/violates-learner-slice-imports-admin-only-authoring.ts",
        "slices/learn/src/violates-learner-slice-imports-admin-only-better-auth.ts",
        "slices/learn/src/violates-learner-slice-imports-admin-only-nlp.ts",
      ],
    ],
    ["foreign-schema", ["slices/learn/src/violates-foreign-schema.ts"]],
    ["core-imports-slice", ["core/progress/src/violates-core-imports-slice.ts"]],
    ["core-dependency-direction", ["core/content-graph/src/violates-core-dependency-direction.ts"]],
  ])("%s fires on exactly its fixtures", (rule, files) => {
    expect(brokenBy(rule).sort()).toEqual(files);
  });

  it("passes every import the rules allow", () => {
    expect(violations.filter((v) => !v.from.includes("/violates-"))).toEqual([]);
  });
});
