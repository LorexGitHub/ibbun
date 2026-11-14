# Feature slices over a small core; slices meet only through core

Many AI agents build ibbun in parallel, and the supervisor doesn't read their code. The architecture has to let one agent change one folder without breaking anyone else, and has to catch violations in CI. Pure vertical slices don't fit, because almost every feature reads the Content Graph and the Review log, and copies of "is this visible" or "is this Known" would drift apart. Classic layers don't fit, because every feature touches every layer. So ibbun is a modular monolith: 13 feature slices on top of four core modules (`content-graph`, `progress`, `learning-path`, `learner`), each behind an `exports`-limited interface, with dependency-cruiser enforcing the rules (see `docs/architecture.md`).

Slices never import each other. They interact only through synchronous calls into core, and screens that show two slices are assembled by the web shell. As a result any slice can be rewritten or deleted without breaking another, and no agent waits on another agent's slice interface.

The cost is that the core could become a queue for every agent. We reduce that in five ways:

- The core is built first (wave 0).
- Each core module is its own package, so agents working on different modules don't touch the same files.
- Slice PRs may make additive core changes, which merge on CI plus a reviewer agent. Only breaking changes and new core modules need the supervisor.
- **Duplication is preferred over coupling.** Small logic is copied until a third slice needs it, and only domain rules must live in core. `dryer` therefore fails within a package and only reports across packages.
- Each package keeps its own migrations, and slices are discovered automatically, so there are no shared registry or migration-journal files to clash on.

## Considered Options

- **Slices publish a `public.ts` that other slices may import.** The core stays smaller, but a slice is no longer safe to rewrite on its own, and agents end up waiting on or mocking each other's interfaces. Rejected because the supervisor values slices that can be replaced on their own above a small core.
- **An event bus between slices.** Rejected for v1. Every cross-feature need found so far already goes through `progress` or `content-graph`.
- **Repo-wide `dryer` as a hard gate.** Rejected. It would force every copy into core and bring the bottleneck back.
- **A separate admin app.** Rejected. Admin slices live under `/admin` in the same SPA and can move out later, because the slice rules keep them separable.

## Consequences

- The core grows over time. Breaking changes need their own issue, and the supervisor approves those and new core modules.
- Code is duplicated on purpose across slices. The reviewer agent opens a "move into core" issue once three or more packages share it.
- Quality gates (ub-mode TDD, CRAP < 10, per-package `dryer`, `mutator`, dependency-cruiser, Playwright) plus pstack `verify-ibbun` evidence from a separate verifier agent replace human code review.
