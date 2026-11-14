# Hallmark: setup, theme catalogue, Vantage, and Hum

Researched 2026-11-05 from primary sources only: the site https://www.usehallmark.com and the repo https://github.com/Nutlope/hallmark at commit `de4999e` (2026-11-04, plugin version 2.0.0). "Repo" means that commit. Repo paths link as `https://github.com/Nutlope/hallmark/blob/main/<path>`. The live theme pages are served straight from the repo's `site/` folder (`vercel.json` sets `"outputDirectory": "site"`), and the live Hum page matched `site/themes/hum/index.html` byte for byte when fetched.

## Summary

- **Hallmark is an agent skill, not a component library.** It is a `SKILL.md` plus reference files and Node scripts. It tells Claude Code (or Codex, Cursor, OpenCode) how to design a page, deals a theme, writes `tokens.css` and `base.css`, and lints the result against "AI slop" tells. MIT licence, made by Together AI.
- **Install for Claude Code with one command:** `npx skills add nutlope/hallmark -g --agent claude-code`. It lands in `~/.claude/skills/hallmark` and is invoked as `/hallmark <prompt>`. A plugin route also exists. Node 18+ is needed. The browser checks also need `puppeteer-core` and Chrome.
- **The catalogue has 50 themes** in four genres (editorial, modern-minimal, playful, atmospheric). Each theme is one Markdown file of at most 8 KB with a picture beside it.
- **Vantage exists.** It is a theme, not a mode: a dark, modern-minimal "reality capture at night" look (blue-black ground, Geologica, one lime signal, point clouds). It is not used here.
- **Hum is a playful, light, cut-paper theme.** Grained cream paper, torn edges, card-stock buttons that press down, blue-black ink, Chillax for everything, pear-yellow for the action, blue for links and focus, coral for one loud moment, mint for growth. Radii are 24px (cards), 16px (buttons) and 14px (inputs). Its keywords already include learning, reading, streak, habit and practice.
- **To get Hum, name it.** A prompt that names a theme skips the deal and is stamped `theme: Hum (by request)`. Then `node <skill-dir>/scripts/theme.mjs scaffold hum --scope app` writes the tokens beside `src/index.css`.
- **To pin Hum for every agent, lock it.** After the first Hum build, say "lock the system". Hallmark writes `design.md` at the repo root. Every later run reads it first, skips the deal and follows it.
- **Gaps for ibbun:** Chillax has no kana or kanji, so Japanese text needs a second font that Hallmark does not supply. The Hum token block does not define `--grain` and `--fibre`, though its build hint uses them. Hum's 54px controls and torn-paper ornament clash with Hallmark's app-screen rules (32 to 40px controls, no ornament), so the prototype has to choose.

---

## 1. What Hallmark is

**A design skill.** The repo describes itself as "Anti-AI-slop design skill for Claude Code, Cursor, and Codex" (https://github.com/Nutlope/hallmark, repo description). The README calls it "A design skill for Claude Code, Codex, Cursor and OpenCode that refuses to look AI-generated" and says "Made by Together AI" (https://github.com/Nutlope/hallmark/blob/main/README.md). The licence is MIT (same README, "Licence").

**What is in the box.** The skill lives in `skills/hallmark/`: `SKILL.md` (the flow and the Floor rules), `references/` (layout, craft, gates, genres, 21 page shapes, and the 50 themes), and `scripts/` (`theme.mjs` for deal, draw, scaffold and log; `sloplint.mjs` for linting; `capture.mjs` for screenshots; `install-hook.mjs` for an edit-time hook) (https://github.com/Nutlope/hallmark/tree/main/skills/hallmark).

**What it does on a build.** Per the README, section "How a build runs": pre-flight reads the project (fonts, palette, framework, a locked `design.md`) and asks once for material; `theme.mjs deal` offers three themes; the hero is built and reviewed first; then `sloplint.mjs --render` checks the page at eight widths and a fresh subagent reviews it (https://github.com/Nutlope/hallmark/blob/main/README.md). The full flow is steps 0 to 7 in `SKILL.md` (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md, "Flow").

**The rules come in tiers.** The **Floor** never ships (contrast, focus, reduced motion, invented facts, broken phone layout). **Reflex** gates are model defaults that a build may waive on the record. **Finish** checks are craft detail that never blocks (README, intro). The 16 Floor rules are listed in `SKILL.md` "The Floor". The ones that matter most for agents: every colour and font goes through a `:root` token; never `transition: all`; every interactive element has `:focus-visible`; every animation has a `prefers-reduced-motion` fallback; never an invented metric or testimonial; never an eyebrow or a tracked-capitals label; never an emoji as an icon; the first line of the CSS is a Hallmark stamp (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md).

**Verbs.** `/hallmark redesign <path>` rebuilds an existing page and keeps its content and wiring. `/hallmark audit <path>` only reports (README, "Redesign"). The skill's own description says it must "Never use it on an existing design unless the user names Hallmark" (`SKILL.md` front matter).

**Optional extras.** With `TOGETHER_API_KEY` set, it can generate comps before building ("signal 9", https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/flow.md, "Comp before build"). It ships a library of 755 openly licensed Wikimedia photos (README, "New in v2").

## 2. Install and use with Claude Code on Vite + React

**Install.** The README gives (https://github.com/Nutlope/hallmark/blob/main/README.md, "Install"):

```
npx skills add nutlope/hallmark -g --agent claude-code
```

`-g` installs for every project; without it the skill goes into the current project. Needs Node 18 or later. For Claude Code it lands in `~/.claude/skills/hallmark` and is invoked with `/hallmark <prompt>` or by describing a new build. The site gives the same commands (https://www.usehallmark.com/). **Unconfirmed:** where a non-`-g` install puts the files inside the project; the README does not say.

**Other routes** (same README section):

- Claude Code plugin: `/plugin marketplace add nutlope/hallmark`, then `/plugin install hallmark@hallmark`. It is then invoked as `/hallmark:hallmark`. The marketplace entry is `.claude-plugin/marketplace.json` (https://github.com/Nutlope/hallmark/blob/main/.claude-plugin/marketplace.json).
- From a clone: `node skills/hallmark/scripts/install.mjs` validates every theme and copies the skill.
- Edit-time hook: `node <skill-dir>/scripts/install-hook.mjs` adds a Claude Code PostToolUse hook that reports Floor findings as files are written (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/flow.md, "Edit-time linting").
- Browser checks need `npm i -g puppeteer-core` and Chrome. Without them only the static checks run (README, "Install"). `CHROME_PATH` and `HALLMARK_PUPPETEER` point at unusual locations (flow.md, "Harnesses").
- If the skill does not fire on its own, name it: "use hallmark to build ..." (README).

**Vite + React specifics.**

- `theme.mjs scaffold` looks for the project's stylesheet in a fixed list that includes `src/index.css`, `src/App.css` and `src/main.css`, and writes `tokens.css` and `base.css` beside the first one it finds. `--dir` overrides this (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/scripts/theme.mjs, function `scaffold`). A default Vite React app has `src/index.css`, so the files go in `src/`.
- The scaffold prints the two imports. They must go right after the last `@import` in the stylesheet, never below a rule, or CSS drops them silently (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/export-formats.md, "`tokens.css` in a project").
- With Tailwind v4 (`@import "tailwindcss"` in the stylesheet), the scaffold writes colours, fonts, sizes, radii, shadows and easings into `@theme static`, so they become utilities such as `bg-paper`, `text-ink`, `font-display` and `rounded-card`. `base.css` is imported with `layer(base)`. Never name a token `--spacing-*` (export-formats.md, "Tailwind v4").
- With shadcn/ui, map shadcn's variables onto Hallmark's (`--background: var(--color-paper)`, `--primary: var(--color-accent)` and so on). shadcn's own `accent` and `muted` names clash with Hallmark's and must be kept apart (export-formats.md, "shadcn/ui").
- In a framework project the render checks run against the dev server: `sloplint <changed files> --render --url http://localhost:<port>/<route>`. The static checks read `.jsx` and `.tsx` files too, including Tailwind class strings, so `uppercase tracking-widest text-xs` or `transition-all` fail (flow.md, "Framework projects").
- Screens someone works in (dashboard, tool, settings) are **app screens**. They use `scaffold <slug> --scope app` and `sloplint --scope app`. App scope drops the marketing rules (no hero, no fold, no word budget, no stand-in photos), uses a fixed type scale of 1.125 to 1.2, controls of 32 to 40px with a 44px hit target, and requires loading, empty, error and full states for every data region. The theme lends "its palette, its faces, its radius and its surfaces, never its layout, navigation or ornament" (flow.md, "App screens").
- A prompt that says quick, rough or prototype (or `--fast`) runs fast mode: no questions, Finish tier skipped, Reflex gates waivable with one line. The Floor, stamp, `tokens.css`, log and contrast still bind (flow.md, "Fast mode").
- Hallmark keeps state in `.hallmark/`: `preflight.json` (cached scan) and `log.json` (past builds, used so later deals differ) (`SKILL.md`, steps 0 and 6).

## 3. Theme catalogue

The README says "fifty themes" and shows ten of them (https://github.com/Nutlope/hallmark/blob/main/README.md, "Themes"). The full list is the compiled index `skills/hallmark/references/themes/index.json` (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/themes/index.json), which has exactly 50 entries. Each has a matching page under `site/themes/<slug>/`. The one-line "material" below is copied from the index; the theme-file contract says it lists "paper, ink, faces, surface, signal" (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/themes/README.md). "Paper" is the band of the page background: light (over 85% lightness), mid (30 to 85) or dark (under 30).

| Theme | Genre | Paper | Material (verbatim from `index.json`) | Page |
| --- | --- | --- | --- | --- |
| Almanac | editorial | mid | cool slate stock with a pale printed sheet, blue-black ink, Hanken Grotesk heads over Newsreader prose with mono figures, two rule weights and square corners, one chart magenta | https://www.usehallmark.com/themes/almanac/ |
| Arcade | playful | dark | aubergine CRT ground, lilac-white ink, Bungee capitals split in RGB over Chivo, Silkscreen figures, hard offset shadows, ember and acid signals | https://www.usehallmark.com/themes/arcade/ |
| Atelier | editorial | light | limewash paper under a slow luminous air, deep umber ink, Sentient light over Hanken Grotesk, cotton card stock with fibre and pressed type, hairlines, matted prints in warm daylight, one cool slate signal | https://www.usehallmark.com/themes/atelier/ |
| Bloom | atmospheric | light | warm off-white paper with grain and a generated working grid, two quiet terracotta blooms, warm umber ink, Ranade with one roman Gambarino figure, rubber and cased parts lit from above, part tones on rounded clips | https://www.usehallmark.com/themes/bloom/ |
| Blueprint | modern-minimal | mid | prussian-blue sheet, white line ink, Chakra Petch capitals over IBM Plex Sans with mono measurements, square double keylines and dimension strings, photographs printed as cyanotypes, the white line as the only signal | https://www.usehallmark.com/themes/blueprint/ |
| Broadside | editorial | light | grained buff stock, near-black ink, Six Caps and Bevan wood capitals over Archivo Narrow, ink rules at one point or five, one vermilion | https://www.usehallmark.com/themes/broadside/ |
| Brutal | editorial | light | near-white poster stock, near-black ink as 3px rules, boxed cells and solid fills, uppercase Libre Franklin 900 over its 400, zero radius, one acid-yellow fill | https://www.usehallmark.com/themes/brutal/ |
| Carnival | editorial | light | tinted paper, deep warm ink, Big Shoulders Display 800 capitals set poster-large over Golos Text, 2px rules, a hard 4px ink shadow, two accents that compete as whole fields | https://www.usehallmark.com/themes/carnival/ |
| Cobalt | modern-minimal | light | cool near-white paper, blue-grey ink and hairlines, Familjen Grotesk over IBM Plex Sans, a generated ASCII field on an 8 by 16 cell, keycaps and cut-corner panels, JetBrains Mono on graphite, one electric cobalt signal | https://www.usehallmark.com/themes/cobalt/ |
| Console | modern-minimal | dark | graphite ground in three lightness steps, pale ink, hairline panels cut from one surface, Host Grotesk 500 for reading, Atkinson Hyperlegible Mono for what was measured, amber for a person and cool blue for an instrument | https://www.usehallmark.com/themes/console/ |
| Coral | modern-minimal | light | warm grey paper and a felt desk, cotton stationery lit from the left, General Sans throughout with Geist Mono figures, letterpress card controls, coral pressed into the stock for the one settled state | https://www.usehallmark.com/themes/coral/ |
| Darkroom | atmospheric | dark | warm print-black ground, a fine light grain, fibre-white ink, hairline Sofia Sans Extra Condensed capitals over Barlow, zero radius, black-and-white photographs printed deeper than the ground, one amber safelight | https://www.usehallmark.com/themes/darkroom/ |
| Dose | modern-minimal | light | warm morning paper with a fibre grain and window light, translucent tinted plastic, green-black ink, Schibsted Grotesk over Instrument Sans with DM Mono pharmacy labels, moulded controls, one pharmacy green | https://www.usehallmark.com/themes/dose/ |
| Dusk | modern-minimal | dark | a real landscape at the turn of the light behind the hero, slate below it, the product in smoked glass with a lit top edge, Wix Madefor Display at a quiet weight over Wix Madefor Text, bone wells for light surfaces, one periwinkle signal and one apricot | https://www.usehallmark.com/themes/dusk/ |
| Editorial | editorial | light | warm white uncoated stock, printed black ink with a cool tilt, Bricolage Grotesque condensed at 800 over Source Serif 4, square corners, a heavy ink rule over 1px hairlines, one printer's green | https://www.usehallmark.com/themes/editorial/ |
| Formwork | editorial | mid | warm grey concrete paper with a speck grain, near-black ink, Oswald capitals over Archivo, square cast edges and hard shadows, hard black-and-white photographs of poured concrete, one safety orange signal | https://www.usehallmark.com/themes/formwork/ |
| Furrow | modern-minimal | light | warm manila paper, near-black ink in rules, a generated survey map in sienna contours and slate water, Red Hat Display 600 over Red Hat Text with Red Hat Mono figures, moulded 6px keys, a waterproof notebook card, one tangerine signal and a grass green for what is in date | https://www.usehallmark.com/themes/furrow/ |
| Garden | editorial | light | warm oat paper, deep green ink, Vollkorn 600 with old-style figures over Hanken Grotesk, hairlines and soft moss or clay tints, daylight photographs in true colour, one leaf-green signal | https://www.usehallmark.com/themes/garden/ |
| Grid | editorial | light | white poster stock, blue-black ink, Radio Canada Big 700 in sentence case over Radio Canada, flat fields of ultramarine and one Swiss red mark, no strokes | https://www.usehallmark.com/themes/grid/ |
| Halftone | playful | light | butter-cream stock, brown-black ink, Ultra over Chivo, three-pixel ink rules and square wells, one vermilion printed solid and through a dot screen, photographs in full colour | https://www.usehallmark.com/themes/halftone/ |
| Hedgerow | editorial | dark | deep leaf-green paper, cream ink, Prata heads over Manrope, low-key photographs in true colour, square flat surfaces with pill controls, one chartreuse signal with a moss strength for cream | https://www.usehallmark.com/themes/hedgerow/ |
| **Hum** | playful | light | grained cream paper pulled toward pear-yellow, torn paper edges with a pale fibre core, card-stock controls that press down, blue-black ink, Chillax throughout, three accents that never blend and a mint for growth | https://www.usehallmark.com/themes/hum/ |
| Ink | editorial | light | white paper, a black with no hue, Epilogue 700 over Epilogue 400, hairline rules and state pills, one teal that means in | https://www.usehallmark.com/themes/ink/ |
| Kiln | atmospheric | dark | near-black ground, cream ink, Boska over Geist, smoked wells, photographs lit by the work, a heat ramp that marks temperature, one ember signal | https://www.usehallmark.com/themes/kiln/ |
| Loom | editorial | light | ecru paper with sand steps, warm near-black ink, Libre Caslon Display heads and prices over Hanken Grotesk, thin rules and one ink rule, cloth photographed close in window light, one deep indigo | https://www.usehallmark.com/themes/loom/ |
| Lumen | atmospheric | dark | violet-black ground, near-white ink, lowercase Instrument Serif heads a step large over Geist and Geist Mono, hairline wells, a faint blueprint grid, one molten brass signal and one rose verb | https://www.usehallmark.com/themes/lumen/ |
| Manifesto | editorial | dark | warm near-black ground, warm off-white ink, Anton capitals at poster size leaded tight over a quiet Public Sans body, hairlines, a heavy ink bar and square edges, one fighting red | https://www.usehallmark.com/themes/manifesto/ |
| Midnight | atmospheric | dark | midnight-blue ground to every edge, cool white ink, Mona Sans expanded at 300 over its normal width, square-cut surfaces in lightness steps, photographs as moonlight, one azure signal | https://www.usehallmark.com/themes/midnight/ |
| Newsprint | editorial | light | pale newsprint stock, warm black ink, Zilla Slab heads over a Spectral body with Libre Franklin agate for listed figures, justified columns under hairline column rules, a double rule, one dried-brick signal | https://www.usehallmark.com/themes/newsprint/ |
| Overprint | playful | light | grey newsprint stock, near-black ink, wide heavy Anybody capitals over Archivo, flat square fills, a teal pass and an orange pass that print moss where they cross, photographs pulled through one pass | https://www.usehallmark.com/themes/overprint/ |
| Paste-up | playful | mid | kraft board, a fibre wash, near-black toner, League Gothic capitals over a Newsreader galley, white copy paper on paper lifts, hard ink offsets, one sheet of fluorescent yellow | https://www.usehallmark.com/themes/pasteup/ |
| Piste | playful | light | snow-white paper, cold near-black ink, Barlow Condensed 800 caps over Barlow, square edges on 2px ink rules, one cobalt for signal and field | https://www.usehallmark.com/themes/piste/ |
| Refract | atmospheric | light | sunlit white plaster with real light falling across it, water caustics or prism dispersion rendered live, deep pool-blue ink, Funnel Display at a light weight over Funnel Sans, clear surfaces that cast tinted shadows, one water signal | https://www.usehallmark.com/themes/refract/ |
| Ribbon | atmospheric | light | warm off-white or blue-black night, Instrument Sans at a quiet weight over Figtree, machined parts lit from above, the hour drawn as light on a generated canvas, one signal | https://www.usehallmark.com/themes/ribbon/ |
| Rim | modern-minimal | dark | warm black paper, warm off-white ink, Switzer 500 with Geist Mono for every measurement, square hairline surfaces, the earth photographed straight down, an orange signal and a sky-blue second | https://www.usehallmark.com/themes/rim/ |
| Riso | editorial | light | bright uncoated stock and no black, a medium blue drum for every word, a fluorescent pink drum for the fills, purple where they cross, Cabinet Grotesk 800 over Literata, grain, one word a hair out of register | https://www.usehallmark.com/themes/riso/ |
| Solstice | editorial | light | cream paper, warm brown ink, Yeseva One over Archivo and Archivo Narrow, gold hairlines and hard paper shadows, photographs in low warm light, one vermilion signal | https://www.usehallmark.com/themes/solstice/ |
| Specimen | editorial | light | warm oat paper, warm near-black ink, razor-hairline Bodoni Moda over Geist, square 1px rules, one ink-blue signal that also draws the metric guides | https://www.usehallmark.com/themes/specimen/ |
| Spore | atmospheric | dark | coffee-ground black with a warm grain, parchment ink, Young Serif over Instrument Sans, soft pills and grained wells, photographs lit by lamps and candles, one oyster pink | https://www.usehallmark.com/themes/spore/ |
| Sport | editorial | light | cool concrete paper, blue-black ink, uppercase Saira Condensed over Albert Sans, condensed figures and mono times, two-weight rules, one volt fill | https://www.usehallmark.com/themes/sport/ |
| Squeeze | playful | mid | forest-green paper with real chroma, warm white ink, Gabarito 800 heads and figures over Manrope, soft rounded tiles a step lighter or deeper, fruit photographed bright and close, juicy peach controls | https://www.usehallmark.com/themes/squeeze/ |
| Sticker | playful | light | warm off-white paper, warm black ink, Bowlby One SC over Sofia Sans, white die-cut borders on hard offset shadows, hot pink, lime and ink fills set with type | https://www.usehallmark.com/themes/sticker/ |
| Studio | editorial | light | cool studio-white proof paper with an ink dot grid and grain, blue-black ink, Hedvig Letters Serif heads over Geist, crop marks on every printed piece, orange construction guides, the work photographed in true colour, one cadmium-orange signal | https://www.usehallmark.com/themes/studio/ |
| Terminal | atmospheric | dark | a near-black ground with a green cast in three lightness steps, pale phosphor ink and one bright phosphor signal with a dim wash of itself, every glyph Martian Mono with heads wide and text narrow, and pictures printed in the page's own glyphs: a photograph rendered as a grid of characters taken from the product's own text, dim cells small, bright cells full, stirred by the cursor | https://www.usehallmark.com/themes/terminal/ |
| Terrazzo | modern-minimal | light | off-white paper, white card surfaces ruled in ink over a hard offset, wide Syne heads over Onest, JetBrains Mono for codes and millimetres, surfaces photographed flat-on in true colour, rust the one signal | https://www.usehallmark.com/themes/terrazzo/ |
| Ultraviolet | modern-minimal | light | lavender paper or a violet-black night, Outfit set lowercase over Onest, hairline pills, one saturated violet in two strengths, photographs pulled into the violet | https://www.usehallmark.com/themes/ultraviolet/ |
| **Vantage** | modern-minimal | dark | blue-black ground, a live point cloud of the real thing as the hero's light, a sweep that lights it, pale steel ink, Geologica with sharpened corners at a light weight, hairline frames with corner ticks, one lime signal for what was found | https://www.usehallmark.com/themes/vantage/ |
| Vellum | editorial | light | parchment paper, a long tan fibre wash on bands, umber ink, Grenze Gotisch heads over Hanken Grotesk with Grenze roman for statements, hairline and double rules, one ultramarine pigment | https://www.usehallmark.com/themes/vellum/ |
| Wayfind | modern-minimal | light | cool grey paper, blue-black ink, Chivo Mono throughout, square 2px ink borders, ink plates, cobalt for what is live, amber for figures on ink | https://www.usehallmark.com/themes/wayfind/ |
| Werkstatt | playful | mid | warm putty ground with a lighter well, near-black ink, Jost 700 capitals and numerals over Karla, square 2px and 3px ink rules that box cells, flat ultramarine, vermilion and yellow primaries | https://www.usehallmark.com/themes/werkstatt/ |

How a theme gets picked (`SKILL.md`, step 3 "Direction"): the first match wins. (1) The user named a theme: build it, stamped `theme: <name> (by request)`. (2) The user asked for custom: no theme. (3) Otherwise `theme.mjs deal --genre <genre> --prompt "<prompt>"` offers three themes that fit the prompt's keywords and differ from the log, and the agent picks one. A `design.md` at the root beats all three (step 0, "Pre-flight"). A theme "is a material, not a plan": it sets paper, ink, faces, radius, controls, motion and voice, never what a page contains or its order (themes/README.md).

## 4. Vantage

**Vantage exists. It is a theme, not a mode.** Its file is `skills/hallmark/references/themes/vantage.md` (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/themes/vantage.md) and its page is https://www.usehallmark.com/themes/vantage/ (HTTP 200 on 2026-11-05). The README shows it as "Vantage theme: Swath, construction site scans" (https://github.com/Nutlope/hallmark/blob/main/README.md, "Themes").

- Header: genre `modern-minimal`, paper `dark 13.5 235`, display `grotesk-sans Geologica`, accent `chromatic-lime 126`, posture `restrained`.
- The file describes it as "Reality capture at night": a live point cloud of the real thing on a blue-black ground, a sweep that lights it, steel-grey ink, Geologica with sharpened corners at a light weight, hairline frames that mark only their corners, and "One lime signal means found, measured, live". Card radius is 4px.
- Its keywords are lidar, scan, survey, mapping, 3d, point cloud, drone, construction, digital twin and similar. It is built for spatial and survey products, not for a language app.

No Hallmark source mentions a "Vantage mode". The only modes the skill names are fast mode and dual light/dark mode (flow.md, "Fast mode"; https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/dark-mode.md).

## 5. Hum in detail

Sources: the theme file `skills/hallmark/references/themes/hum.md` (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/themes/hum.md), its picture `hum.jpg` beside it, and the demo page https://www.usehallmark.com/themes/hum/ (source `site/themes/hum/`, https://github.com/Nutlope/hallmark/tree/main/site/themes/hum). The demo is "Sprout: read a little, grow a garden", a five-minute daily reading game for children aged 5 to 8. A second Hum example is `site/made/hum-coding-camp/` (https://www.usehallmark.com/made/hum-coding-camp/). Everything in this section is from `hum.md` unless another URL is given.

**Header.**

```
genre: playful
paper: light 97 95
display: rounded-sans Chillax
accent: chromatic-yellow 95
posture: full-palette
keywords: daily, habit, streak, practice, learning, reading, curiosity, mood, energy, friendship, community, kids, family, parents, school, game, puzzle, creative, playful, alive
material: grained cream paper pulled toward pear-yellow, torn paper edges with a pale fibre core, card-stock controls that press down, blue-black ink, Chillax throughout, three accents that never blend and a mint for growth
photo: natural vib=12 exp=4
pictured: Workbench, Settled hero
```

**The look in one paragraph.** "Cut paper made by hand, cheerful without turning childish": cream paper with visible grain and fibre, sheets torn along their edges so a pale core shows, card stock you can press, all lit from the top left. Chillax runs from heading to label in blue-black ink. "Three accents never blend: pear for the action, blue for links, coral for one loud moment; mint is growth." It is "Not a pastel nursery template, not a rainbow page, not clip-art."

### 5.1 Tokens

The full token block, as `theme.mjs scaffold hum` copies it into `tokens.css` (the scaffold copies the fenced block verbatim, per `theme.mjs` function `scaffold` and themes/README.md):

```css
:root {
  --color-paper: oklch(97% 0.012 95); --color-paper-2: oklch(94.5% 0.018 95); --color-paper-3: oklch(91% 0.022 95);
  --color-ink: oklch(20% 0.014 255); --color-ink-2: oklch(29% 0.014 255); --color-muted: oklch(47% 0.014 255);
  --color-rule: oklch(87% 0.016 95);
  --color-accent: oklch(87% 0.175 96); --color-accent-deep: oklch(72% 0.16 92); --color-accent-ink: oklch(20% 0.014 255);
  --color-accent-2: oklch(50% 0.17 250); --color-accent-3: oklch(70% 0.2 22);
  --color-mint: oklch(82% 0.15 152); --color-mint-deep: oklch(48% 0.12 155); --color-focus: oklch(50% 0.17 250);
  --color-card: oklch(98.8% 0.007 95); --color-edge: oklch(83% 0.04 88); --color-fringe: oklch(99.2% 0.006 95);
  --color-kraft: oklch(63% 0.085 62); --color-sand: oklch(77% 0.1 76); --color-sugar: oklch(89% 0.035 236);
  --color-hill-1: oklch(94.5% 0.03 118); --color-hill-2: oklch(91.5% 0.045 135); --color-leaf: oklch(64% 0.15 150);
  --font-display: "Chillax", ui-rounded, ui-sans-serif, sans-serif; --font-body: var(--font-display);
  --font-outlier: "Geist Mono", ui-monospace, monospace;
  --radius-card: 24px; --radius-stock: 16px; --radius-input: 14px; --radius-pill: 999px; --rule-hair: 1px;
  --shadow-card: 0 1px 2px oklch(20% 0.014 255 / 0.06), 0 12px 28px -14px oklch(20% 0.014 255 / 0.22);
  --shadow-paper: drop-shadow(0 0 0.6px oklch(20% 0.014 255 / 0.32)) drop-shadow(1.5px 2.5px 1.5px oklch(20% 0.014 255 / 0.1)) drop-shadow(6px 14px 16px oklch(20% 0.014 255 / 0.13));
  --tracking-display: -0.03em; --display-weight: 600;
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); --ease-snap: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Roles in plain words:

| Token | Role |
| --- | --- |
| `--color-paper`, `-paper-2`, `-paper-3` | Cream page, then two darker steps for bands and sheets |
| `--color-ink`, `-ink-2`, `-muted` | Blue-black heads, body text, labels and captions |
| `--color-accent` (pear), `-accent-deep` | The primary action and its 5px card-stock edge; the one pear field |
| `--color-accent-2` (blue), `--color-focus` | Links and the focus ring |
| `--color-accent-3` (coral) | "one loud fill" |
| `--color-mint`, `-mint-deep` | Growth |
| `--color-card`, `-edge`, `-fringe` | Secondary card stock, its edge, the pale torn-fibre core |
| `--color-kraft`, `-sand`, `-sugar`, `-hill-*`, `-leaf` | Grounds: kraft strip, blue sugar-paper mat, far hills, soil |

**Shared tokens from the scaffold.** Every theme also gets the shared scale (`theme.mjs`, constant `SCALE`): spacing `--space-3xs` 2px, `-2xs` 4, `-xs` 8, `-sm` 12, `-md` 16, `-lg` 24, `-xl` 40, `-2xl` 64, `-3xl` 96, `-4xl` 144; durations `--dur-micro` 120ms, `--dur-short` 220ms, `--dur-long` 420ms; `--color-error: oklch(52% 0.19 27)` and `--color-success: oklch(50% 0.12 150)`; z-index layers. On a page build the type scale is 1.25 from 16px with fluid display sizes. With `--scope app` it switches to a fixed 1.2 scale (`--text-md` 1rem, `--text-lg` 1.2rem, `--text-xl` 1.44rem, `--text-display` 1.728rem) (`theme.mjs`, function `scaffold`).

**Texture tokens are missing from the block.** The build hint and the surfaces rules use `var(--grain)` and `var(--fibre)`, but the token block does not declare them. The demo page declares them itself in `site/themes/hum/style.css` as `feTurbulence` SVG data URIs (`--grain`: fractal noise, base frequency .85; `--fibre`: turbulence, base frequency .024), along with page-only tokens such as `--shadow-paper-low` and `--color-white` (https://github.com/Nutlope/hallmark/blob/main/site/themes/hum/style.css, the `:root` block at lines 11 to 37). The torn edges are precomputed `clip-path: polygon(...)` values in `site/themes/hum/paper.css` ("generated from seeded value noise"). An agent building in Hum has to copy or regenerate these. The texture budget in https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/texture.md still binds: page-wide grain at opacity 0.08 or less, 0.05 or nothing under running text, never animated.

### 5.2 Type

- **Font:** Chillax, weights 500 and 600 only, from Fontshare: `<link href="https://api.fontshare.com/v2/css?f[]=chillax@500,600&display=swap" rel="stylesheet">`. Geist Mono only inside code.
- **Display:** Chillax 600, tracking −0.03em, line height 1.02 to 1.05, sentence case. Big figures at `--text-display` or larger with their unit at `--text-title`.
- **Body:** Chillax 500 at 17 to 19px, line height 1.5. Emphasis is a pear highlighter band behind the words (`mark`), never inside a heading.
- **Labels, captions, units:** Chillax 500 one step smaller, sentence case, `--color-muted`. Never tracked capitals (Floor rule 9 in `SKILL.md`).
- **No Japanese glyphs.** Chillax covers Latin only. Checked on 2026-11-05 by loading the 500 weight from the Fontshare CSS above and listing its character map with `fc-query`: it covers U+0020 to U+FB02 (Latin, Latin Extended, punctuation) and nothing in kana (U+3040 to U+30FF) or CJK ideographs (U+4E00 to U+9FFF). No Hallmark file mentions Japanese or CJK (searched `skills/hallmark/`). Kana and kanji will fall through to `ui-rounded, ui-sans-serif, sans-serif`, which varies by OS.

### 5.3 Surfaces and components

- **Paper:** generated, never a picture. Grain and fibre under every paper, card and accent fill.
- **Torn edges:** a band, nav bar, photo or sheet ends in a noise `clip-path`, with the pale `--color-fringe` twin one pixel proud beneath. Grounds may layer hills, soil, a kraft strip or a sugar-paper mat.
- **Light from the top left:** stacked `--shadow-paper` drop shadows fall down and right. A card may lift one corner in a page curl.
- **Round everywhere:** 24px surfaces (28 to 32px for children), 16px card stock, 14px inputs. No square corner.
- **Bands:** paper-2, a torn ink sheet with paper text, or one pear field. Two per page at most.
- **Buttons (card stock):** 54px tall at `--radius-stock`, grain and fibre on the fill, an inset top highlight and a solid 5px edge below (`--color-accent-deep` on primary, `--color-edge` on secondary). Hover raises the edge to 7px and lifts 2px; active presses it to 1px and drops 4px.
- **Selected pill:** ink fill with paper-coloured text. One die-cut sticker may carry an offer.
- **Inputs:** 52px tall, 14px radius, 1px `--color-muted` border, the blue focus ring.
- **Range without photos:** the product as card-stock tiles on a torn kraft strip, each pressed tile popping into its accent; growth set in type (plants made of Chillax glyphs); three or four real figures at display size on one pear sheet; a choice as card-stock pills whose result is a sentence with its key value in a pear `mark`.

The build hint CSS (verbatim from `hum.md`):

```css
h1, h2, h3 { font-weight: var(--display-weight); }
.btn { --edge: 5px; border: 0; border-radius: var(--radius-stock); min-height: 54px; padding: 0 var(--space-lg); font-weight: 600; background: var(--grain), var(--fibre), var(--color-card); box-shadow: inset 0 0 0 1px var(--color-rule), 0 var(--edge) 0 0 var(--color-edge); transition: translate var(--dur-micro) var(--ease-snap), box-shadow var(--dur-micro) var(--ease-snap); }
.btn--primary { background: var(--grain), var(--fibre), var(--color-accent); color: var(--color-accent-ink); box-shadow: 0 var(--edge) 0 0 var(--color-accent-deep), 2px calc(var(--edge) + 4px) 10px -3px color-mix(in oklab, var(--color-ink) 32%, transparent); transition-timing-function: var(--ease-spring); }
.btn:hover { --edge: 7px; translate: 0 -2px; } .btn:active { --edge: 1px; translate: 0 4px; }
.sheet { position: absolute; filter: var(--shadow-paper); } .sheet > i { position: absolute; inset: 0; background: var(--grain), var(--fibre), var(--sheet-c, var(--color-paper-3)); }
mark { background: color-mix(in oklab, var(--color-accent) 55%, transparent); color: inherit; box-decoration-break: clone; }
a { color: var(--color-accent-2); }
```

### 5.4 Motion and voice

- **Motion:** `--ease-spring` on the primary button only. Everything else uses `--ease-snap`. Never `scale()`. A word pops in its accent and its plant grows; a timer may tear off a scrap of paper as it runs. Under reduced motion or with no script, show the end state.
- **Voice:** "Warm, smart, casual, direct, written to the grown-up beside the child." Sentence case, verbs over nouns, honest numbers only.

### 5.5 Do-nots

From `hum.md`: never a serif, never pure white paper, never a square corner; never a clean vector edge on a cut sheet or a shadow that falls up or left; never a gradient between two accents, never a rainbow ground; never emoji, stock icons or a drawn character ("type, paper and the product carry it").

### 5.6 How to select and install Hum

1. Install the skill: `npx skills add nutlope/hallmark -g --agent claude-code` (README, "Install"). Optional: `npm i -g puppeteer-core` for the browser checks, and `node ~/.claude/skills/hallmark/scripts/install-hook.mjs` for the edit-time hook.
2. Name the theme in the prompt, for example `/hallmark build the ibbun dashboard in the Hum theme`. A named theme skips the deal and is stamped `theme: Hum (by request)` (`SKILL.md`, step 3).
3. Scaffold from the project root: `node ~/.claude/skills/hallmark/scripts/theme.mjs scaffold hum --scope app`. It writes `src/tokens.css` and `src/base.css` beside `src/index.css` and prints the stamp and the two `@import` lines (`theme.mjs`, function `scaffold`). Add `--force` to overwrite existing files.
4. Look at `skills/hallmark/references/themes/hum.jpg` for palette balance, type voice and surfaces, never layout (`SKILL.md`, step 4).
5. Add the Chillax `<link>` to `index.html`.
6. After the first screen exists, say "lock the system". Hallmark writes `design.md` at the root from `tokens.css` (https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/design-md.md). A hand-written `design.md` in the same format should also work, since pre-flight only looks for the file. **Unconfirmed:** that a hand-written one behaves identically.

## 6. Notes for ibbun

These are practical notes for the prototype ticket #17 ("UI prototypes in Hallmark": dashboard, review session, the 男 → 男性 → 男は仕事に行った drill-down, and a reading passage with tap-to-lookup and mark-as-Known). Statements about Hallmark carry their sources; the rest are suggestions.

**Pin Hum so every agent uses it.**

- The strongest pin is `design.md` at the repo root with `Theme: Hum`. Pre-flight reads it first; it "overrides everything below, and pages share it"; the deal is skipped; and "the variety rule inverts (pages share the system rather than differ)" (`SKILL.md` step 0; flow.md, "Pre-flight edge cases"; design-md.md, "After the file exists"). Without it, `.hallmark/log.json` makes each new deal avoid recent themes, so un-pinned agents will drift away from Hum.
- Hallmark treats `design.md` as design data only and ignores instructions inside it (flow.md, "Pre-flight edge cases").
- Suggestion: also add a line to the project `CLAUDE.md` or `AGENTS.md`: "UI work uses Hallmark with the Hum theme; `design.md` and `src/tokens.css` are the source of truth; name Hallmark in the prompt." Hallmark reads `AGENTS.md` as a pre-flight signal on Codex and OpenCode (flow.md, "Pre-flight edge cases"). **Unconfirmed:** whether Hallmark reads `CLAUDE.md`; Claude Code loads it anyway.
- Name Hallmark in every UI prompt. The skill does not run on an existing design unless named, and "Any other change to an existing design is not a Hallmark run: do it as asked, in the project's own system" (`SKILL.md`, front matter and "Flow"). Edits outside Hallmark must still use the Hum tokens.
- Commit `design.md`, `src/tokens.css`, `src/base.css` and `.hallmark/log.json`. The stamp and the log are "the durable memory" across long sessions (flow.md, "Harnesses").

**All four screens are app screens.** Use `scaffold hum --scope app` and `sloplint --scope app --url http://localhost:5173/<route>` (5173 is Vite's usual port; check the dev server). App scope needs loading, empty, error and full states for each data region, keeps state in the URL, and has a "signature" object (flow.md, "App screens"). For ibbun that object is plausibly the review card or the drill-down chain.

**Decide where Hum yields to app scope.** App scope wants 32 to 40px controls and borrows the theme's palette, faces, radius and surfaces but "never its layout, navigation or ornament" (flow.md, "App screens"). Hum wants 54px card-stock buttons, torn edges, hills and soil (`hum.md`). Suggestion: keep the palette, Chillax, the radii, grain and fibre, and the pressable card-stock answer buttons in the review session, where pressing is the job. Keep torn edges and grounds for a few surfaces (the session-complete moment, an empty state). Write the decision into `design.md` so every agent makes the same call. Hallmark says a page that needs something else amends `design.md` with a `## Variants` section (design-md.md).

**Fix the Japanese font before building.** Chillax has no kana or kanji (section 5.2). Suggestion: add a rounded Japanese face as a second family for Japanese text only, for example `--font-jp`, and put it in `design.md`. Hallmark allows two families, or three with one outlier role (`SKILL.md`, step 6, "Type and motion"); Geist Mono already holds the outlier slot, so a Japanese face makes three. **Unconfirmed:** how sloplint counts a script-specific fallback face; test it. Large kanji on the drill-down are display text and should use `--display-weight` 600.

**Map Hum's accents onto study states.** Hum gives each accent one job: pear for the primary action, blue for links and focus, coral for "one loud fill", mint for growth (`hum.md`, "Controls"). Suggestions: pear for Submit, Next and Start reviews; mint for a correct answer, a level up and Known; `--color-error` (from the scaffold) for a wrong answer rather than coral, so coral can stay as the single loud moment (for example the session wrap-up). Blue for tap-to-lookup words in a reading passage, since blue means link. The pear `mark` highlighter can show the word under lookup or the target grammar in a sentence. Never blend two accents in a gradient.

**Voice.** Hum is written "to the grown-up beside the child" and its demo is a children's reading game. Suggestion: keep "warm, smart, casual, direct" and sentence case, drop the child framing, and use 28 to 32px child radii nowhere.

**Things the Floor will catch.** No emoji as icons (Hum also bans stock icons). No tracked-caps labels such as "N5" badges in tracked capitals. No invented stats on the dashboard: show only real counts the app computes (`SKILL.md`, "The Floor", rules 8 to 11). Every animation, including a word "popping" or a plant growing, needs a reduced-motion end state.

**Fast mode fits #17.** A prompt that says "prototype" runs fast mode (no questions, Finish tier skipped), but the Floor, stamp, tokens and contrast still bind (flow.md, "Fast mode").
