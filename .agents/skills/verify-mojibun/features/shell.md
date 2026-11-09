# App shell

The shell is the web app every slice mounts into: the slice routes, a home screen built from widgets slices register, and the wayfinding. Each slice's nav entry names a `place` (`home`, `study`, `practice`, `library`, `account`, `supervisor`), a one-line `blurb`, an optional `glyph` and `rank`, and whether it is a `session`. `apps/web/src/places.ts` turns those into the bar, the account menu, the ⌘K menu and the map on Today. The API answers a health check, and the web app proxies `/api` to it.

## Sub-features

- `shell-home` renders the layout with its `<nav>` landmark at `/`.
- `shell-fallback` renders the home screen for any unknown route.
- `shell-bar` shows Today, the practice screens and the Library as pills, then **Go to** (⌘K or Ctrl K) and the account button. Logged out, the account button is a **Log in** pill.
- `shell-account-menu` opens from the initial in the bar: the email, Settings, the Supervisor screens (Approval, Import) for a Supervisor only, and **Log out**, which shows a toast.
- `shell-command-menu` opens on ⌘K, Ctrl K or `/` (not while typing). It lists every place the Learner can reach, grouped, and filters by label and blurb ("kanji" finds Learn, Placement and Library).
- `shell-session` replaces the pills with the session's glyph and name and a **Done for now** button to `/` on a session screen (Reviews, Learn, Cram, Placement).
- `shell-paths` lists Study, Practice and Library under "Every way in" on Today, with Reviews first. Logged out, `/` shows a welcome with **Sign up** and **Log in** and the same map, unlinked, under "What's inside".
- `shell-health` answers `GET /api/health` with `{"ok":true}`, directly and through the web proxy.

## How to get to it (user POV)

- Open `http://localhost:5173/`.
- Open any path no slice registers, such as `http://localhost:5173/nowhere`.
- Press Ctrl K anywhere, or click **Go to**.
- Click the initial at the right of the bar.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.

- **Home.** Open `/`. Run `verify.sh shot / shell/home`. `home.aria.txt` contains a `navigation` landmark.
- **Fallback.** Open `/nowhere`. Run `verify.sh shot /nowhere shell/fallback`. The page renders the same layout as Home, with no error.
- **Health.** Run `curl -s http://localhost:5173/api/health` and `curl -s http://localhost:3000/api/health`. Both print `{"ok":true}`.
- **Bar.** Logged in as the Learner, open `/`. The `navigation` landmark holds exactly Today, Listening, Reading and Library. Approval and Import appear nowhere. Logged in as the Supervisor, the account menu lists them under "Supervisor".
- **Command menu.** Press Ctrl K. A dialog named "Go to" opens. Type `kanji`: the options are Learn, Placement and Library. Press Enter: the URL is `/learn`.
- **Session.** On `/learn` or `/reviews` the `navigation` landmark holds no links, and a **Done for now** link points to `/`.
- **Logged out.** In a fresh context open `/`. The page shows **Sign up** (`/signup`) and **Log in** (`/login`) and "What's inside".
- **Harness spec.** Run `pnpm exec playwright test --project=anonymous`. `e2e/shell.spec.ts` passes.

## Gotchas

- Until a slice registers a nav entry, the `<nav>` is empty: assert it is attached, not visible.
- The shell reads the session again on every navigation, so the bar catches up after the Login screen navigates to `/`.
- Better Auth only trusts the configured web origin. A second Vite on another port can log in but gets 403 on **Log out**.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
