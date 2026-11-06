# App shell

The shell is the web app every slice mounts into: a nav bar of slice entries, the slice routes, and a home screen built from widgets slices register. The API answers a health check, and the web app proxies `/api` to it.

## Sub-features

- `shell-home` renders the layout with its `<nav>` landmark at `/`.
- `shell-fallback` renders the home screen for any unknown route.
- `shell-health` answers `GET /api/health` with `{"ok":true}`, directly and through the web proxy.

## How to get to it (user POV)

- Open `http://localhost:5173/`.
- Open any path no slice registers, such as `http://localhost:5173/nowhere`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.

- **Home.** Open `/`. Run `verify.sh shot / shell/home`. `home.aria.txt` contains a `navigation` landmark.
- **Fallback.** Open `/nowhere`. Run `verify.sh shot /nowhere shell/fallback`. The page renders the same layout as Home, with no error.
- **Health.** Run `curl -s http://localhost:5173/api/health` and `curl -s http://localhost:3000/api/health`. Both print `{"ok":true}`.
- **Harness spec.** Run `pnpm exec playwright test --project=anonymous`. `e2e/shell.spec.ts` passes.

## Gotchas

- Until a slice registers a nav entry, the `<nav>` is empty: assert it is attached, not visible.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
