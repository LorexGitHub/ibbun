// Records the raw footage for the promo: one Playwright video of the logged-in demo Learner, plus
// marks.json with when each beat happens (seconds into the video) and where its subject sits (CSS px).
// Run: EMAIL=<from seed-demo.mjs> node assets/showcase/demo/record.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, "out", "raw");
mkdirSync(raw, { recursive: true });
const WEB = "http://localhost:5173";
const API = "http://localhost:3000";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD ?? "ibbun-promo-demo-2026";
if (!EMAIL) throw new Error("EMAIL is not set (run seed-demo.mjs first)");
const VIEW = { width: 1440, height: 810 };

const browser = await chromium.launch();

// Log in and warm the slow endpoints outside the recording, so the take has no loading screens.
const warm = await browser.newContext();
const signIn = (ctx) => ctx.request.post(`${API}/api/auth/sign-in/email`, { data: { email: EMAIL, password: PASSWORD }, headers: { origin: WEB } });
if (!(await signIn(warm)).ok()) throw new Error("login failed");
const state = await warm.storageState();
const learnBatch = await (await warm.request.get(`${API}/api/learn/batch`, { timeout: 300_000 })).json();
const due = await (await warm.request.get(`${API}/api/reviews/due`, { timeout: 300_000 })).json();
await warm.request.get(`${API}/api/dashboard/today`, { timeout: 300_000 });
await warm.close();

const ctx = await browser.newContext({
  // Recorded at 1080p with the page zoomed 4/3: the 1440-wide layout, drawn at full 1080p sharpness.
  // Playwright pads, rather than scales, a video larger than the viewport, so deviceScaleFactor won't do.
  viewport: { width: 1920, height: 1080 },
  colorScheme: "light",
  storageState: state,
  recordVideo: { dir: raw, size: { width: 1920, height: 1080 } },
});
await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.zoom = "1.3333")));
await ctx.addInitScript(() => localStorage.setItem("ibbun.theme", JSON.stringify({ palette: "shu", mode: "light" })));
const page = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const marks = {};
const box = async (loc) => {
  const b = await loc.first().boundingBox();
  return b && { x: b.x, y: b.y, w: b.width, h: b.height };
};
const mark = async (name, loc) => (marks[name] = { t: now(), box: loc ? await box(loc) : null });
const hold = (ms) => page.waitForTimeout(ms);

const showsSentence = (q, sentenceText) =>
  sentenceText.includes(q.sentence.before + q.sentence.after) || sentenceText.replace("＿＿＿", q.sentence.target) === q.sentence.before + q.sentence.target + q.sentence.after;
const answerFor = (prompts, sentenceText) => prompts.find((q) => showsSentence(q, sentenceText)) ?? prompts[0];
// A reading is typed in kana; a cloze answer as written.
const fromAccepted = { reading: ({ written, reading }) => reading ?? written, cloze: ({ written, reading }) => written ?? reading };
const answerValue = (f) => (f.answerData.facet === "meaning" ? f.answerData.meanings[0].text : fromAccepted[f.facet](f.answerData.accepted[0]));
const fill = async (prompt) => {
  for (const f of prompt.facets) {
    const label = { cloze: "Answer", reading: "Reading in this sentence", meaning: "Meaning of the kanji" }[f.facet];
    const value = answerValue(f);
    const input = page.getByLabel(label, { exact: true });
    await input.click();
    await input.fill(value);
    await hold(350);
  }
};

// 1. Today: the counters.
await page.goto(`${WEB}/`);
await page.locator("#today-count").waitFor({ timeout: 300_000 });
// Marked as the count appears: the clip opens on the arrival (the count rolls up, the way up draws).
await mark("today", page.locator(".today"));
marks.todayPath = { box: await box(page.locator(".path")) };
await hold(5000);
marks.todayEnd = { t: now() };

// 2. Learn: what is next, then one card turned.
await page.goto(`${WEB}/learn`);
await page.getByRole("button", { name: "Start" }).waitFor({ timeout: 300_000 });
await hold(600);
await mark("learnStart", page.locator(".learn-start"));
await hold(2200);
await page.keyboard.press("Enter");
await page.locator(".lesson-card").waitFor();
await hold(400);
await mark("lesson", page.locator(".lesson-card"));
await hold(1600);
await page.keyboard.press("2");
await hold(2600);
marks.lessonTurned = { t: now(), box: await box(page.locator(".lesson-card")) };
await hold(1200);
marks.lessonEnd = { t: now() };
// Through the remaining cards to the quiz.
for (let i = 0; i < 12 && !(await page.locator(".quiz").count()); i++) {
  await page.keyboard.press("2");
  await hold(250);
  await page.keyboard.press("Enter");
  await hold(350);
}
await page.locator(".quiz .sentence").waitFor();
await hold(500);
const prompts = learnBatch.items.map((i) => i.prompt);
const quizPrompt = answerFor(prompts, await page.locator(".quiz .sentence").innerText());
await mark("quiz", page.locator(".question"));
await hold(800);
await fill(quizPrompt);
await hold(500);
marks.quizCheck = { t: now(), box: await box(page.locator(".question .lesson-actions .btn")) };
await page.keyboard.press("Enter");
await page.locator(".question .feedback").waitFor();
await hold(300);
marks.quizCorrect = { t: now(), box: await box(page.locator(".question")) };
await hold(2600);
marks.quizEnd = { t: now() };

// 3. Reviews: a cloze sentence, answered.
await page.goto(`${WEB}/reviews`);
await page.locator(".sentence").first().waitFor({ timeout: 300_000 });
await hold(700);
const reviewPrompt = answerFor(due.reviews, await page.locator(".sentence").first().innerText());
await mark("review", page.locator("form").first());
await hold(900);
await fill(reviewPrompt);
await hold(400);
marks.reviewCheck = { t: now(), box: await box(page.getByRole("button", { name: /^Check/ })) };
await page.keyboard.press("Enter");
await page.getByText("Correct", { exact: true }).first().waitFor();
await hold(300);
marks.reviewCorrect = { t: now(), box: await box(page.locator("main")) };
await hold(2600);
marks.reviewEnd = { t: now() };

// 4. Five looks, light and dark, on Today.
await page.goto(`${WEB}/`);
await page.locator("#today-count").waitFor({ timeout: 300_000 });
await hold(1200);
const looks = [["shu", "dark"], ["ai", "light"], ["matcha", "dark"], ["sakura", "light"], ["shiro-kuro", "dark"], ["shu", "light"]];
marks.looks = { t: now(), each: [] };
// Each look spreads from the seal, as Settings' picker does it (theme.tsx revealTheme, motion.css).
for (const [palette, mode] of looks) {
  await page.evaluate(([p, m]) => {
    const seal = document.querySelector(".brand").getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty("--reveal-x", `${seal.left + seal.width / 2}px`);
    root.style.setProperty("--reveal-y", `${seal.top + seal.height / 2}px`);
    document.startViewTransition(() => Object.assign(root.dataset, { palette: p, mode: m }));
  }, [palette, mode]);
  marks.looks.each.push(now());
  await hold(1300);
}
marks.looksEnd = { t: now() };

const video = page.video();
await ctx.close();
await browser.close();
const src = await video.path();
const dest = join(raw, "take.webm");
renameSync(src, dest);
for (const f of readdirSync(raw)) if (f !== "take.webm" && f.endsWith(".webm")) renameSync(join(raw, f), join(raw, `old-${f}`));
writeFileSync(join(raw, "marks.json"), JSON.stringify({ view: VIEW, scale: 1, marks }, null, 2));
console.log(dest);
