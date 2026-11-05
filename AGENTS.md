# mojibun — agent instructions

Many agents build mojibun in parallel. The supervisor does not review code; CI gates and a separate verifier agent do. Read these before changing anything:

- [`CONTEXT.md`](CONTEXT.md): the domain glossary. Use its terms in code, issues and PRs.
- [`docs/architecture.md`](docs/architecture.md): slices, core modules and the dependency rules CI enforces.
- [`docs/adr/`](docs/adr/): why things are the way they are.

## Rules

- Work in **ub-mode** (`.agents/skills/ub-mode`) for every code change. Its tools `crapper`, `dryer` and `mutator` come from `github.com/unclebob/*` and must be cloned side by side.
- One issue → one slice folder. **Never import another slice.** Reach shared state only through core interfaces.
- You may make **additive** changes to a core module in your slice PR. **Breaking** core changes and new core modules need their own issue.
- Prefer copying small logic over coupling packages. Domain rules always go in core.
- Before opening a PR, update your slice's file in `verify-mojibun/features/` (`/maintain-verification-skill`, pstack). A different agent verifies the PR.
- Push a branch and open a PR. Never push to the main line.
