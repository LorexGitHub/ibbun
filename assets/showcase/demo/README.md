# README demo

The demo at the top of the README (`assets/demo.mp4`, `assets/demo.gif`): the title, then Today, a
lesson, the quiz, Reviews and the five looks as a learner uses them, then the title again. Cut with
[product-demo-director](https://github.com/crimeacs/product-demo-director): real footage, one held
framing per screen, no zooms.

| File | What it is |
| --- | --- |
| `seed-demo.mjs` | A demo Learner with two weeks of history, so Today shows a streak and Reviews due. |
| `record.mjs` | Plays that Learner through Today, Learn, the quiz, Reviews and the five looks in Playwright, at 1080p. Writes `out/raw/take.webm` and `out/raw/marks.json` (when each screen happens and where its card sits). |
| `script.mjs` | Turns the marks into `script.json`, the product-demo-director timeline. |
| `brand.json` | The Ma palette and Mincho type for the title card. |

## Make it

Needs the app on :5173, the API on :3000, ffmpeg, and a product-demo-director checkout with its
engine and Python tools installed (see its SKILL.md).

```sh
export DATABASE_URL=postgres://...                   # the database the API uses
node assets/showcase/demo/seed-demo.mjs          # prints the demo email
EMAIL=<that email> node assets/showcase/demo/record.mjs
node assets/showcase/demo/script.mjs
mkdir -p assets/showcase/demo/assets
ffmpeg -i assets/showcase/demo/out/raw/take.webm -vf fps=30 -c:v libx264 -crf 14 -pix_fmt yuv420p \
  assets/showcase/demo/assets/take.mp4
python <pdd>/tools/build.py --project assets/showcase/demo --contracts strict
ffmpeg -i assets/showcase/demo/out/demo.mp4 -c copy -movflags +faststart assets/demo.mp4
```

Then the GIF: `fps=12,scale=960:-1` through `palettegen`/`paletteuse`.

On Windows the engine's render call needs two local edits in `tools/build.py`: `npx.cmd` instead of
`npx`, and `--port=3456` so Remotion's server does not collide with the API on :3000. Run its Python
with `PYTHONUTF8=1`.

The film is silent. `finish.py` and `qa.py` expect an audio stream, so their loudness and silence
checks do not apply; the picture checks pass.
