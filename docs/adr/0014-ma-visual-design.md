# ADR 0014: Ma visual design, with five looks in light and dark

- Status: Accepted
- Date: 2026-11-09
- Supersedes: [ADR 0011](0011-hum-visual-design.md)

## Context

The Hum look from ADR 0011 (cream cut paper, torn edges, card-stock buttons) did not land once real screens were built on it. We prototyped three directions on the real Today screen, with live data: a sidebar app shell ("Studio"), a single calm focus ("Ma"), and a bento dashboard ("Playground"). Ma was chosen. We then tried five colour looks for it, each in light and dark, and decided to keep all of them as a Learner setting rather than pick one.

## Decision

The app uses **Ma** (間, "the space between"):

- One thing at a time. Today shows a single large number, one sentence, the next step as the one accent button, a "Where to?" search and the way up the JLPT Levels.
- Shippori Mincho B1 for headings, numbers and all Japanese. Instrument Sans for everything else.
- Navigation is a dock of glyphs along the bottom (今 復 新 測 詰 聞 読 辞), with the name on hover and focus, plus the ⌘K menu. A session screen (Reviews, Learn, Cram, Placement) hides the dock and offers "Done for now".
- Buttons are pills. The accent fills the primary one; the rest are hairline outlines. No textures, no torn edges.
- The logo is 文 in four strokes on an accent seal, like a name stamp. It takes the Learner's look. `assets/icon.svg` and the favicon are the Shu seal.

There are **five looks**, each with a light and a dark mode: Shu 朱 (vermilion on washi, the default), Ai 藍 (indigo), Matcha 抹茶 (green), Sakura 桜 (pink on plum) and Shiro / Kuro 白黒 (pure white and pure black). Settings → Appearance picks the look and Light, Dark or Match my device. The choice is saved per device in `localStorage`.

Each look is six colours (`--p-bg`, `--p-ink`, `--p-accent`, `--p-on-accent`, `--p-quiet`, `--p-glass`) in `platform/ui/src/palettes.css`. `tokens.css` derives every other colour token from those six, so a screen that uses the kit's tokens follows the chosen look and mode without knowing about it.

## Alternatives considered

- **Studio** (sidebar shell, cards, progress bars). The most scalable layout, but it read as a generic SaaS dashboard.
- **Playground** (top tabs, a bento of bright tiles). Fun on Today, too busy once every screen uses it.
- **One fixed palette.** Simpler, but the five looks cost six variables each, and Learners study at night.
- **Saving the look on the account.** It would follow the Learner across devices, but needs a core `learner` preference and a migration. Per-device storage is enough for now; moving it is additive.

## Consequences

- `docs/design/ibbun-mock.html` is now history: it shows the Hum look, not the target. The prototypes live on the `prototype/redesign` branch.
- Slice CSS must use the kit's colour tokens, never fixed colours, or it breaks in dark mode and in the other looks. `tokens.test.ts` checks that every look sets all six roles in both modes.
- The palette variables are prefixed `--p-` because shadcn already uses `--accent`, `--background` and similar names.
- Hallmark's `sloplint` was tuned for Hum's genre. `design.md` no longer claims a Hallmark theme.
