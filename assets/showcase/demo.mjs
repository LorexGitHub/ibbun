// Records the showcase video (assets/demo.mp4 + assets/demo.gif) from a running app.
// Needs a fresh database with the dev accounts and the N5 fixture, and ffmpeg on PATH (or FFMPEG=...).
// Run: BASE_URL=http://localhost:5173 node assets/showcase/demo.mjs
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const W = 1280, H = 720;

// Quiz answers, read from the fixture source: sentence -> reading, literal -> meaning.
const fixture = readFileSync(join(root, "core/content-graph/src/fixture/n5.ts"), "utf8");
const readings = new Map([...fixture.matchAll(/line\("([^"]+)", "[^"]*", "([^"]+)", "([^"]+)", "([^"]+)"\)/g)].map((m) => [m[1], { target: m[2], reading: m[3], hint: m[4] }]));
const meanings = new Map([
  ...[...fixture.matchAll(/literal: "(.)", meanings: \["([^"]+)"/g)].map((m) => [`kanji:${m[1]}`, m[2]]),
  ...[...fixture.matchAll(/form: "([^"]+)", reading: "[^"]+", glosses: \["([^"]+)"/g)].map((m) => [`word:${m[1]}`, m[2]]),
  ...[...fixture.matchAll(/title: "([^"]+)", formation: [^\]]+\], meaning: "([^"]+)"/g)].map((m) => [`grammar:${m[1]}`, m[2]]),
]);

// The overlay: a cursor with click ripples, chapter captions and full-screen title cards.
// It lives on <html>, outside <body>, so the zoom on <body> never moves it.
const overlay = () => {
  const css = `
  #sc-cursor{position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
    background:rgba(20,20,20,.18);border:2px solid rgba(20,20,20,.75);box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;
    transition:left .35s cubic-bezier(.5,0,.2,1),top .35s cubic-bezier(.5,0,.2,1),transform .15s}
  #sc-cursor.down{transform:scale(.7)}
  .sc-ripple{position:fixed;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid #d9381e;
    pointer-events:none;animation:sc-ripple .6s ease-out forwards}
  @keyframes sc-ripple{to{transform:scale(4.5);opacity:0}}
  #sc-cap{position:fixed;z-index:2147483645;left:50%;top:84px;transform:translate(-50%,-14px);opacity:0;pointer-events:none;
    font:500 17px/1.2 system-ui,sans-serif;color:#fff;background:rgba(18,18,18,.86);backdrop-filter:blur(6px);padding:12px 22px;border-radius:999px;
    white-space:nowrap;transition:opacity .4s,transform .4s;box-shadow:0 8px 30px rgba(0,0,0,.25)}
  #sc-cap.on{opacity:1;transform:translate(-50%,0)}
  #sc-cap b{color:#ff8a70;font-weight:600;margin-right:10px;letter-spacing:.08em}
  #sc-card{position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:#d9381e;color:#fff;opacity:0;pointer-events:none;transition:opacity .7s}
  #sc-card.on{opacity:1}
  #sc-card .g{font:400 150px/1 "Shippori Mincho","Noto Serif JP",serif;transform:scale(.9);transition:transform 2.4s ease-out}
  #sc-card.on .g{transform:scale(1)}
  #sc-card .t{font:600 46px/1 Georgia,serif;letter-spacing:.02em}
  #sc-card .s{font:400 22px/1.3 system-ui,sans-serif;opacity:.9}
  body{transition:transform .8s cubic-bezier(.5,0,.2,1)}`;
  const mount = () => {
    if (document.getElementById("sc-cursor")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.append(st);
    for (const id of ["sc-cursor", "sc-cap", "sc-card"]) { const d = document.createElement("div"); d.id = id; document.documentElement.append(d); }
    const last = JSON.parse(sessionStorage.getItem("sc-cursor") ?? "[640,360]");
    Object.assign(document.getElementById("sc-cursor").style, { left: `${last[0]}px`, top: `${last[1]}px` });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.sc = {
    move(x, y) { const c = document.getElementById("sc-cursor"); c.style.left = `${x}px`; c.style.top = `${y}px`; sessionStorage.setItem("sc-cursor", JSON.stringify([x, y])); },
    click(x, y) {
      const c = document.getElementById("sc-cursor"); c.classList.add("down"); setTimeout(() => c.classList.remove("down"), 160);
      const r = document.createElement("div"); r.className = "sc-ripple"; r.style.left = `${x}px`; r.style.top = `${y}px`;
      document.documentElement.append(r); setTimeout(() => r.remove(), 700);
    },
    caption(n, text) { const c = document.getElementById("sc-cap"); c.innerHTML = n ? `<b>${n}</b>${text}` : text; c.classList.toggle("on", !!text); },
    card(g, t, s) { const c = document.getElementById("sc-card"); c.innerHTML = g ? `<div class="g">${g}</div><div class="t">${t}</div><div class="s">${s}</div>` : ""; c.classList.toggle("on", !!g); },
    zoom(scale, x, y) { document.body.style.transformOrigin = `${x}px ${y}px`; document.body.style.transform = scale === 1 ? "" : `scale(${scale})`; },
  };
};

const videoDir = mkdtempSync(join(tmpdir(), "ibbun-demo-"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
await ctx.addInitScript(overlay);
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const caption = (n, text) => page.evaluate(([n, t]) => window.sc.caption(n, t), [n, text]);
const card = (g = "", t = "", s = "") => page.evaluate(([g, t, s]) => window.sc.card(g, t, s), [g, t, s]);
const zoom = (scale, x = W / 2, y = H / 2) => page.evaluate(([s, x, y]) => window.sc.zoom(s, x, y), [scale, x, y]);

async function pointAt(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => window.sc.move(x, y), [x, y]);
  await wait(380);
  return [x, y];
}
async function click(locator, pause = 350) {
  const [x, y] = await pointAt(locator);
  await page.evaluate(([x, y]) => window.sc.click(x, y), [x, y]);
  // The app's glyph dock can sit over a button near the bottom edge.
  await locator.click({ timeout: 3000 }).catch(() => locator.click({ force: true }));
  await wait(pause);
}
async function type(locator, text, delay = 70) {
  await click(locator, 100);
  await locator.pressSequentially(text, { delay });
}
const button = (name) => page.getByRole("button", { name }).first();

// Opening card.
await page.goto(`${BASE}/login`);
await card("一文ずつ", "ibbun", "Learn Japanese for the JLPT, one sentence at a time");
await wait(3200);
await card();
await wait(700);

// Log in.
await caption("01", "Log in");
await type(page.getByLabel("Email"), "learner@ibbun.test", 35);
await type(page.getByLabel("Password"), "learner-password", 30);
await click(button("Log in"), 0);
await page.waitForURL((u) => !u.pathname.includes("login"));
await wait(900);

// Today.
await caption("02", "Today: what's due, and the next step");
await wait(1600);
await zoom(1.35, W / 2, 330);
await wait(1800);
await zoom(1);
await wait(900);
await pointAt(page.locator(".dock, nav").last());
await wait(900);

// Learn: lessons.
await click(page.getByRole("link", { name: /Learn/ }).or(page.getByRole("button", { name: /Learn \d+ new/ })).first(), 900);
await caption("03", "Learn a batch of new Study Items");
await wait(1300);
await click(button(/Start/), 900);
await caption("03", "Every item comes inside a real sentence");
let lessons = 0;
while (!(await button(/Check/).count())) {
  const slow = lessons < 2;
  if (await button(/Not yet/).count()) { await click(button(/Not yet/), slow ? 2400 : 350); lessons++; }
  else await click(button(/Next|Start quiz/), slow ? 500 : 250);
}

// Learn: quiz. The first answer is wrong on purpose, to show the item coming back.
await caption("04", "Then a quiz: type the reading and the meaning");
let missed = false;
for (let i = 0; i < 30 && (await button(/Check/).count()); i++) {
  const sentence = (await page.locator(".sentence").first().innerText()).trim();
  // A cloze shows the sentence with the target blanked out.
  const blank = new RegExp(`^${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[_＿]+/g, "(.+)")}$`);
  const line = readings.get(sentence) ?? [...readings].find(([text]) => blank.test(text))?.[1];
  const inputs = page.locator("form input");
  const labels = await inputs.evaluateAll((es) => es.map((e) => e.getAttribute("aria-label") ?? ""));
  const kind = /kanji/i.test(labels.join(" ")) ? "kanji" : /grammar/i.test(labels.join(" ")) ? "grammar" : "word";
  const meaning = meanings.get(`${kind}:${line?.target}`) ?? [...meanings].find(([k]) => k.startsWith(`${kind}:`) && k.includes(line?.target ?? "\0"))?.[1] ?? line?.hint ?? "";
  const fast = i > 1;
  for (let j = 0; j < labels.length; j++) {
    const answer = /reading|answer/i.test(labels[j]) ? line?.reading ?? "" : meaning;
    const wrong = !missed && /meaning/i.test(labels[j]);
    await type(inputs.nth(j), wrong ? "water" : answer, fast ? 20 : 70);
  }
  await click(button(/Check/), fast ? 450 : 1800);
  if (!missed) { missed = true; await caption("04", "A miss comes back later in the same quiz"); }
  const next = button(/Next|Continue|Try again/);
  if (await next.count()) await click(next, fast ? 150 : 400);
}
await caption("05", "A summary of the batch");
await wait(2400);

// Library.
await caption("06", "The Library: every Kanji, Word and Grammar Point");
await page.goto(`${BASE}/browse`);
await wait(1400);
await click(page.locator("main a, main button").filter({ hasText: /^山$/ }).first(), 1400);
await zoom(1.2, W / 2, 260);
await wait(1800);
await zoom(1);
await wait(600);

// Command menu.
await caption("07", "Ctrl K jumps anywhere");
await page.keyboard.press("Control+k");
await wait(700);
await page.keyboard.type("read", { delay: 120 });
await wait(1300);
await page.keyboard.press("Enter");
await wait(1800);

// Settings: the five looks, light and dark.
await page.goto(`${BASE}/settings`);
await caption("08", "Five looks, in light and dark");
await wait(1000);

const radio = (text) => page.getByRole("radio").filter({ hasText: text }).first();
for (const look of ["Ai", "Matcha", "Sakura", "Shiro", "Shu"]) await click(radio(look), 900);
await click(radio(/Dark$/), 1100);
for (const look of ["Ai", "Sakura"]) await click(radio(look), 900);
await page.goto(`${BASE}/`);
await caption("", "");
await wait(1800);

// Closing card.
await card("一文", "ibbun", "N5 to N1 · reading-first · spaced repetition");
await wait(3200);

const video = page.video();
await ctx.close();
await browser.close();
const webm = await video.path();

const mp4 = join(root, "assets/demo.mp4"), gif = join(root, "assets/demo.gif");
execFileSync(FFMPEG, ["-y", "-ss", "0.4", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" });
execFileSync(FFMPEG, ["-y", "-i", mp4, "-vf", "fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif], { stdio: "inherit" });
console.log(readdirSync(videoDir), mp4, gif);
