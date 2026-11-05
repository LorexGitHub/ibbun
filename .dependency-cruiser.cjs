// The dependency rules from docs/architecture.md#dependency-rules. CI runs
// `pnpm depcruise`; scripts/gates/dependency-rules.test.ts proves each rule
// fires on a fixture that breaks it. Paths are relative to the repo root.
const PACKAGE = "^(apps|core|platform|slices)/([^/]+)/";
const ADMIN_SLICES = "(import|content-generation|content-approval)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "slice-imports-another-slice",
      comment:
        "Rule 1: a slice imports only core interfaces, platform packages and its own files. A slice never imports another slice (or an app).",
      severity: "error",
      from: { path: "^slices/([^/]+)/" },
      to: { path: "^(slices|apps)/", pathNot: "^slices/$1/" },
    },
    {
      name: "package-internals",
      comment:
        "Rule 2: reach another package only through its name and its package.json exports, never by a relative path into its files. Apps may import a slice's register.ts (the generated slice index).",
      severity: "error",
      from: { path: PACKAGE },
      to: {
        path: "^(apps|core|platform|slices)/",
        pathNot: ["^$1/$2/", "^slices/[^/]+/register\\.ts$"],
        dependencyTypes: ["local"],
      },
    },
    {
      name: "unresolvable",
      comment:
        "Rule 2: an import that does not resolve. A subpath a package's exports do not list never resolves.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "learner-slice-imports-admin-only",
      comment:
        "Rule 3: a Learner-facing slice never imports content-graph/authoring, nlp, tts, llm or better-auth. Every slice except the admin slices counts as Learner-facing.",
      severity: "error",
      from: { path: "^slices/", pathNot: `^slices/${ADMIN_SLICES}/` },
      to: {
        path: [
          "^core/content-graph/(src/)?authoring(/|\\.ts$)",
          "^platform/(nlp|tts|llm)/",
          "(^|/)node_modules/better-auth/",
          "(^|/)node_modules/\\.pnpm/better-auth@",
          "^better-auth(/|$)",
        ],
      },
    },
    {
      name: "foreign-schema",
      comment:
        "Rule 4: code queries only its own package's Postgres schema. Another package's db/ folder (its tables and migrations) is never imported; data from elsewhere comes through an interface.",
      severity: "error",
      from: { path: PACKAGE },
      to: { path: "^(core|platform|slices)/[^/]+/db/", pathNot: "^$1/$2/" },
    },
    {
      name: "core-imports-slice",
      comment: "Rule 5: core never imports a slice or an app.",
      severity: "error",
      from: { path: "^core/" },
      to: { path: "^(slices|apps)/" },
    },
    {
      name: "core-dependency-direction",
      comment:
        "Rule 5: content-graph, learner and any other core module import no other core module.",
      severity: "error",
      from: { path: "^core/(?!progress/|learning-path/)([^/]+)/" },
      to: { path: "^core/", pathNot: "^core/$1/" },
    },
    {
      name: "core-dependency-direction",
      comment: "Rule 5: progress may import only content-graph.",
      severity: "error",
      from: { path: "^core/progress/" },
      to: { path: "^core/", pathNot: "^core/(progress|content-graph)/" },
    },
    {
      name: "core-dependency-direction",
      comment: "Rule 5: learning-path may import only content-graph and progress.",
      severity: "error",
      from: { path: "^core/learning-path/" },
      to: { path: "^core/", pathNot: "^core/(learning-path|content-graph|progress)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|target|coverage)/" },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts"],
    },
  },
};
