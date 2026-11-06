---
name: verify-mojibun
description: Launch mojibun's local stack (Compose Postgres + Mailpit, Hono API, Vite web app), check it is healthy, drive the web app in a real browser with Playwright and capture evidence. Use to verify a PR branch's slice journeys before merge, or whenever you need proof that a mojibun screen or API route works for a Learner or admin.
---

# verify-mojibun

Proves mojibun behaviour by driving the real app the way a Learner does. Read cold: every command here is literal and runs from the repo root.

The verifier is never the PR author ([architecture.md](../../../docs/architecture.md#verification-flow-pstack)). Check out the PR branch (`gh pr checkout <n>`), then follow Launch → Doctor → Drive → Evidence → Cleanup.

## Launch

Needs Node 24+, pnpm (`corepack enable`), Docker you can talk to without sudo, and Chromium for Playwright (`pnpm exec playwright install chromium` once).

```sh
.agents/skills/verify-mojibun/scripts/verify.sh up
```

It refuses to start if ports 5432, 1025, 8025, 3000 or 5173 are taken: stop your dev stack (`docker compose down`, `pnpm dev`) first. Never drive an instance this script did not start. One verify run per machine; the ports are fixed by `compose.yaml` and `vite.config.ts`.

What `up` does: starts `postgres` and `mailpit` in a separate Compose project `mojibun-verify` with `--wait` (healthcheck green), runs `pnpm install --frozen-lockfile`, `pnpm gen`, `pnpm db:migrate` against an empty volume, then starts the API (`:3000`) and web app (`:5173`) in the background. **Ready** means it printed `ready: web http://localhost:5173 ...`, which needs `GET /api/health` to answer both directly and through the web proxy. Logs and pids go to `target/verify/run/`. Sudachi and VOICEVOX are not started; only admin slices use them, through fakes in tests.

## Doctor

```sh
.agents/skills/verify-mojibun/scripts/verify.sh doctor
```

Read-only. Every line must say `ok`: the API and web processes were started by `up`, Compose Postgres is healthy, Mailpit answers, `/api/health` is `{"ok":true}` directly and via the proxy, the web root serves the SPA. It prints the commit under test; it must match the PR head (`gh pr view <n> --json headRefOid`). Run it first whenever anything looks off. On `FAIL`, read the matching log in `target/verify/run/`.

## Drive

The harness is Playwright (`@playwright/test`, already a dev dependency). Base URL `http://localhost:5173`; the API is reached through the web app's `/api` proxy.

1. **Slice journeys.** Each Learner-facing slice ships one spec at `slices/<slice>/tests/*.spec.ts`. Run the ones the PR touches against the running stack:
   ```sh
   pnpm exec playwright test --project=anonymous                      # shell journeys in e2e/
   pnpm exec playwright test --project=learner slices/<slice>/tests   # once slices/account exists
   ```
   Locally `reuseExistingServer` makes Playwright use the stack from `up`. Do not set `CI=1`; that makes Playwright start its own servers.
2. **Feature-map journeys.** Open `features/<slice>.md` and walk every bullet under `Driving it with Playwright`. Write the steps as a throwaway script at `target/verify/journeys/<slice>.ts` that uses `chromium` from `@playwright/test`, modelled on `scripts/shot.ts`, and run it with `node target/verify/journeys/<slice>.ts`. (The repo's Playwright config only matches `e2e/` and `slices/*/tests/`, so a spec file under `target/` would not run.)
3. **Locators.** Use roles and accessible names (`getByRole("button", { name: "Log in" })`, `getByLabel("Email")`), never CSS position. The shell's nav is the `<nav>` landmark; each slice's nav entry is a link with the slice's label.
4. **Mail.** Sign-up, verification and reset mails land in Mailpit: `curl -s http://localhost:8025/api/v1/messages` lists them, `GET /api/v1/message/<ID>` gives the body with the link to follow.
5. **API.** `curl -s http://localhost:5173/api/<slice>/...`. Every slice's routes are mounted under `/api/<slice name>`.

## Evidence

Everything goes under `target/verify/evidence/<slice>/` (gitignored, survives Cleanup).

```sh
.agents/skills/verify-mojibun/scripts/verify.sh shot <route> <slice>/<step>
# e.g. verify.sh shot / shell/home  ->  target/verify/evidence/shell/home.png + home.aria.txt
```

Proof standards:

- Drive the real user path: the form, the button, the link. No test-only endpoints, no direct DB writes to set up state the UI can create.
- Capture the action and the resulting state (before and after), not only the final screen.
- Check side effects the user can't see: rows via `docker compose -p mojibun-verify exec postgres psql -U mojibun -c '...'`, mails in Mailpit, jobs enqueued.
- Fakes only where a production boundary already isolates the service (`nlp`, `tts`, `llm`).
- If a journey's precondition is missing, report the step as failed with the reason; never weaken the journey.

Attach to the PR as one comment: the commit SHA, the Doctor output, each feature-map step with pass/fail, and the Playwright output. Upload screenshots with `gh` or reference the CI artifact.

## Cleanup

```sh
.agents/skills/verify-mojibun/scripts/verify.sh down
```

Kills only the pids `up` recorded (and their children), then `docker compose -p mojibun-verify down -v`, which deletes the verify database volume. `target/verify/evidence/` stays. Run `down` after every failed attempt too.

## Helpers

- `scripts/verify.sh up|doctor|down|shot <route> <name>`: the lifecycle above.
- `scripts/shot.ts <url> <outPrefix>`: screenshot plus ARIA snapshot of one page (`node .agents/skills/verify-mojibun/scripts/shot.ts http://localhost:5173/ target/verify/evidence/x`).

## Feature map

[`features/README.md`](features/README.md) indexes one file per slice. Slice authors keep their file current with `/maintain-verification-skill` before opening a PR. A file that still says *Not built yet* means the slice has no journeys to verify.
