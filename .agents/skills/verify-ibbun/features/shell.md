# App shell

The shell is the web app every slice mounts into: the slice routes, a home screen built from widgets slices register, and the wayfinding. Each slice's nav entry names a `place` (`home`, `study`, `practice`, `library`, `account`, `supervisor`), a one-line `blurb`, an optional `glyph` and `rank`, and whether it is a `session`. `apps/web/src/places.ts` turns those into the dock, the account menu, the ⌘K menu and the welcome's map. The look is Ma ([ADR 0014](../../../../docs/adr/0014-ma-visual-design.md)): five palettes, each light and dark, picked in Settings → Look. The API answers a health check, and the web app proxies `/api` to it.

## Sub-features

- `shell-home` renders the layout at `/`.
- `shell-fallback` renders the home screen for any unknown route.
- `shell-dock` is the `navigation` landmark "Main" along the bottom, shown only to a logged-in Learner outside a session: one glyph link per place (今 Today, 復 Reviews, 新 Learn, 測 Placement, 詰 Cram, 聞 Listening, 読 Reading, 辞 Library), each named by `aria-label`, the name shown on hover and focus, `aria-current="page"` on the current one.
- `shell-top` is the quiet top line: the 文 seal alone on the left, a link named "ibbun" to `/`; the wide **Where to?** field (⌘K or Ctrl K) and the account button on the right. Logged out, the account button is a **Log in** pill.
- `shell-levels` is the `navigation` landmark "Levels" beside the seal, shown only to a logged-in Learner outside a session: N5, N4, N3, N2 and N1, each a link to `/level/n5` … `/level/n1`, with `aria-current="page"` on the level the Learner is on.
- `shell-kanji` is the screen's kanji, large and faint at the bottom right, behind everything and hidden from assistive technology (`.app-kanji`): a level's numeral on its level page (四 on `/level/n4`), the screen's glyph on a screen that has one (復 on `/reviews`), and 文 everywhere else, Today included.
- `shell-account-menu` opens from the initial in the top line: the email, Settings, the Supervisor screens (Approval, Import) for a Supervisor only, and **Log out**, which shows a toast.
- `shell-command-menu` opens on ⌘K, Ctrl K or `/` (not while typing). It has two panes. The right one lists every place the Learner can reach, grouped, and filters by label and blurb ("kanji" finds Learn, Placement and Library). The left one, for a logged-in Learner, is the `radiogroup` "Level": All, N5, N4, N3, N2, N1. With a level chosen, a first option "N3 level page" goes to `/level/n3`, and the Study and Practice doors open for that level (`/reviews?level=n3`); Library and Account doors do not change. The level is not remembered: the menu opens on All.
- `shell-level-filter` is the `navigation` landmark "Level filter" (the kit's `LevelFilter`): All, N5, N4, N3, N2, N1, with `aria-current="true"` on the active one. It stands in the top line of a Study or Practice door whose address carries `?level=`, in place of "Levels", and beside the session name in a session. Clicking a level rewrites `?level=` in place, **All** removes it and "Levels" returns. It is never stored: leaving the screen drops it.
- `shell-session` replaces the levels with the session's glyph and name, and the field and account button with a **Done for now** button to `/`, on a session screen (Reviews, Learn, Cram, Placement). A session screen that renders `SessionCount` shows how far it is, as "2 / 5", after the name (`#session-count`).
- `shell-welcome`: logged out, `/` shows whatever a slice registered in the `welcome` slot (the account slice puts its sign-up split there, see [account.md](account.md)) and Study, Practice and Library under "What's inside". With no such widget the shell shows its own line with **Sign up** and **Log in**.
- `shell-theme` applies the saved look before the first paint: `<html>` carries `data-palette` and `data-mode`, read from `localStorage` key `ibbun.theme`; "Match my device" follows `prefers-color-scheme`.
- `shell-health` answers `GET /api/health` with `{"ok":true}`, directly and through the web proxy.

## How to get to it (user POV)

- Open `http://localhost:5173/`.
- Open any path no slice registers, such as `http://localhost:5173/nowhere`.
- Press Ctrl K anywhere, or click **Where to?**.
- Click the initial at the right of the top line.
- Hover any glyph in the dock to see its name.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.

- **Home.** Logged in as the Learner, open `/`. Run `verify.sh shot / shell/home`. `home.aria.txt` contains the `navigation` landmarks "Levels" and "Main", and a link "ibbun". No text "ibbun" shows in the top line.
- **Levels.** Click **N3** in the top line. The URL is `/level/n3`, the N3 link is current, and `.app-kanji` reads 三.
- **Background kanji.** Open `/browse`: `.app-kanji` reads 辞. Open `/`: it reads 文. Shoot both, and one level page, in a light and a dark look and check the kanji stays a watermark behind the text.
- **Fallback.** Open `/nowhere`. Run `verify.sh shot /nowhere shell/fallback`. The page renders the same layout as Home, with no error.
- **Health.** Run `curl -s http://localhost:5173/api/health` and `curl -s http://localhost:3000/api/health`. Both print `{"ok":true}`.
- **Dock.** Logged in as the Learner, open `/`. The `navigation` landmark "Main" holds exactly Today, Reviews, Learn, Placement, Cram, Listening, Reading and Library, with Today marked current. Approval and Import appear nowhere. Logged in as the Supervisor, the account menu lists them under "Supervisor".
- **Command menu.** Press Ctrl K. A dialog named "Where to?" opens with the search field focused. Type `kanji`: the options are Learn, Placement and Library. Press Enter: the URL is `/learn`. Open it again, click **N3** in the "Level" group, then **Reviews**: the URL is `/reviews?level=n3`. Open it again: **All** is checked.
- **Level filter.** Open `/reviews?level=n3`: the top line shows the session name and the "Level filter" with **N3** current, and no "Levels". Click **N5**: the address is `/reviews?level=N5` with no page load. Click **All**: the address is `/reviews` and the filter is gone. Open `/browse?level=n3`: no filter.
- **Session.** On `/learn` or `/reviews` there is no dock, no "Levels" and no **Where to?**; the top line shows the session's glyph and name, and a **Done for now** link points to `/`.
- **Theme.** In Settings → Look pick Ai and Dark. `document.documentElement.dataset` is `{palette: "ai", mode: "dark"}`, the page background turns navy, and a reload keeps it. `verify.sh shot / shell/ai-dark`.
- **Logged out.** In a fresh context open `/`. The page shows the sign-up split with a **Sign up** button, **Log in** (`/login`) and "What's inside", and no dock: there is no `navigation` landmark.
- **Harness spec.** Run `pnpm exec playwright test --project=anonymous`. `e2e/shell.spec.ts` passes.

## Gotchas

- `/level/n5` … `/level/n1` show Today until the dashboard slice registers the level page.
- A level in the address narrows Reviews, Learn, Reading, Listening and Placement, and sets the level of Cram's picker.
- The shell reads the session again on every navigation, so the top line catches up after the Login screen navigates to `/`.
- If login says "email or password is wrong" for a seeded account, or sign-up fails with a 500, check that `DATABASE_URL` reaches the container: a local PostgreSQL on 5432 answers first and has no `ibbun` role. `/api/health` does not touch the database, so it stays green.
- Better Auth only trusts the configured web origin. A second Vite on another port can log in but gets 403 on **Log out**.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.

## Keys

- On a session screen **Esc** is **Done for now**: it goes to `/`. The link shows the Esc mark and carries `aria-keyshortcuts="Escape"`. Esc does nothing on other screens or while a dialog is open (the dialog closes instead).
- The kit owns the keys: `useKey`, `KeyMark` and the `hotkey` prop of `Button` in `@ibbun/ui`.
