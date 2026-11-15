// Cuts the promo from out/raw/take.webm + marks.json (record.mjs) and the cards in cards.html.
// Run: node assets/showcase/commercial/build.mjs   (FFMPEG=path/to/ffmpeg if it is not on PATH)
// Output: assets/demo.mp4 and assets/demo.gif (the README video), 1920x1080, 30 fps.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const seg = join(out, "seg");
mkdirSync(seg, { recursive: true });
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const ff = (...args) => execFileSync(FFMPEG, ["-v", "error", "-y", ...args], { stdio: "inherit" });
const W = 1920, H = 1080, FPS = 30, FADE = 0.35;
const take = join(out, "raw", "take.webm");
const { view, marks: m } = JSON.parse(readFileSync(join(out, "raw", "marks.json"), "utf8"));

// 1. Cards to PNG; captions keep a transparent background.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(pathToFileURL(join(here, "cards.html")).href);
await page.evaluate((story) => {
  for (const el of document.querySelectorAll("[data-story]")) el.textContent = story[el.dataset.story];
}, m.story);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
for (const id of await page.$$eval(".card", (els) => els.map((e) => e.id))) {
  await page.locator(`#${id}`).screenshot({ path: join(seg, `${id}.png`), omitBackground: id.startsWith("cap-") });
}
await browser.close();

const enc = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS)];

/** A still card, with a slow push in so it never sits dead. */
const card = (name, dur, as = name) => {
  const n = Math.round(dur * FPS);
  ff("-loop", "1", "-t", String(dur + 1), "-i", join(seg, `${name}.png`), "-frames:v", String(n),
    "-vf", `scale=${W * 2}:${H * 2},zoompan=z='1+0.04*on/${n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${W}x${H}:fps=${FPS}`,
    ...enc, join(seg, `${as}.mp4`));
  return { file: join(seg, `${as}.mp4`), dur };
};

/** A 16:9 window around a box (CSS px), padded and kept inside the frame. */
const frame = (box, pad = 48, minW = 640) => {
  let w = Math.max(box.w + pad * 2, (box.h + pad * 2) * (16 / 9), minW);
  w = Math.min(w, view.width, view.height * (16 / 9));
  const h = w * (9 / 16);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), view.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), view.height - h);
  const even = (v) => Math.round(v / 2) * 2;
  return { x: even(x), y: even(y), w: even(w), h: even(h) };
};

/** The caption fades in over the clip as a second input. */
const overlay = (caption, dur) =>
  caption
    ? { inputs: ["-loop", "1", "-t", String(dur), "-i", join(seg, `${caption}.png`)], filter: `;[1:v]format=rgba,fade=in:st=0.25:d=0.3:alpha=1[c];[v][c]overlay=0:0[v2]`, out: "[v2]" }
    : { inputs: [], filter: "", out: "[v]" };
/** A piece of the take, cropped to `box`, pushing in by `push`, with an optional caption. */
const clip = (name, from, to, box, { push = 0.06, caption } = {}) => {
  const dur = +(to - from).toFixed(3);
  const n = Math.round(dur * FPS);
  const c = frame(box);
  const zoom = `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W * 2}:${H * 2}:flags=lanczos,zoompan=z='1+${push}*on/${n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${W}x${H}:fps=${FPS}`;
  const over = overlay(caption, dur);
  ff("-ss", String(from), "-t", String(dur), "-i", take, ...over.inputs, "-filter_complex", `[0:v]fps=${FPS},${zoom}[v]${over.filter}`, "-map", over.out, "-an", ...enc, join(seg, `${name}.mp4`));
  return { file: join(seg, `${name}.mp4`), dur };
};

const looksBox = { x: view.width * 0.18, y: 0, w: view.width * 0.64, h: view.height };

// 2. The beats, in order.
const beats = [
  card("title", 3.6),
  card("beat-sentence", 2.4),
  clip("lesson", m.lesson.t - 0.1, m.lessonEnd.t, m.lessonTurned.box, { caption: "cap-lesson" }),
  card("beat-check", 2.2),
  clip("quiz", m.quiz.t + 0.2, m.quizEnd.t, m.quizCorrect.box, { caption: "cap-quiz", push: 0.05 }),
  clip("review", m.review.t, m.reviewEnd.t, { ...m.review.box, h: m.review.box.h + 60 }, { caption: "cap-review", push: 0.08 }),
  card("beat-progress", 2.2),
  clip("today", m.today.t - 0.2, m.todayEnd.t, { x: m.today.box.x, y: m.today.box.y, w: m.today.box.w, h: m.today.box.h * 0.9 }, { caption: "cap-today", push: 0.1 }),
  clip("looks", m.looks.t - 0.3, m.looksEnd.t, looksBox, { caption: "cap-looks", push: 0.04 }),
  card("beat-payoff", 2.6),
  card("title", 4.2, "title-end"),
];

// 3. Crossfade them into one.
const inputs = beats.flatMap((b) => ["-i", b.file]);
let graph = "", last = "[0:v]", offset = 0;
for (let i = 1; i < beats.length; i++) {
  offset += beats[i - 1].dur - FADE;
  const label = i === beats.length - 1 ? "[out]" : `[x${i}]`;
  graph += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
  last = label;
}
const final = join(here, "..", "..", "demo.mp4");
ff(...inputs, "-filter_complex", graph.slice(0, -1), "-map", "[out]", ...enc, "-movflags", "+faststart", final);
// The README shows the GIF and links the MP4.
ff("-i", final, "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", join(here, "..", "..", "demo.gif"));
console.log(final, `${(offset + beats.at(-1).dur).toFixed(1)}s`);
