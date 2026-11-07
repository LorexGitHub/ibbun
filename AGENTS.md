# mojibun — agent instructions

Many agents build mojibun in parallel. The supervisor does not review code; CI gates and a separate verifier agent do. Read these before changing anything:

- [`CONTEXT.md`](CONTEXT.md): the domain glossary. Use its terms in code, issues and PRs.
- [`docs/architecture.md`](docs/architecture.md): slices, core modules and the dependency rules CI enforces.
- [`docs/adr/`](docs/adr/): why things are the way they are.
- [`docs/build-plan.md`](docs/build-plan.md): the implementation issues, their order and blockers. Pick only issues labelled `ready-for-agent`.
- [`docs/licensing.md`](docs/licensing.md): which licences content may have, and how Attribution is computed and shown. Read it before importing, generating or displaying content.

## Rules

- Work in **ub-mode** (`.agents/skills/ub-mode`) for every code change. Its tools `crapper`, `dryer` and `mutator` come from `github.com/unclebob/*` and must be cloned side by side.
- One issue → one slice folder. **Never import another slice.** Reach shared state only through core interfaces.
- You may make **additive** changes to a core module in your slice PR. **Breaking** core changes and new core modules need their own issue.
- Prefer copying small logic over coupling packages. Domain rules always go in core.
- Before shipping, update your slice's file in `verify-mojibun/features/` (`/maintain-verification-skill`, pstack).

## Shipping an issue

Work in your own git worktree on a branch for the issue. GitHub Actions is only a fast safety net (typecheck, tests, Playwright), so don't wait on it. The slow gates run on this machine.

1. One time per machine: `node scripts/gates/setup-tools.ts` (clones crapper, dryer and mutator into `~/.ub-tools`, or `$UB_TOOLS`).
2. Commit your work, then run `pnpm ship`. It rebases on `origin/main`, runs every gate (`pnpm gate:local`: typecheck, dependency-cruiser, vitest with coverage, crapper, dryer, mutator) and pushes to `main`. If main moves meanwhile it rebases and gates again.
3. Close the issue with `gh issue close <n>`. This also unblocks the issues that depend on it.
4. From the main checkout, remove the worktree: `git worktree remove <path>` and delete its branch.

If a gate fails, fix it and run `pnpm ship` again. Never push to `main` without it.
