// Captures a screenshot and an ARIA snapshot of one URL. Usage: node shot.ts <url> <outPrefix>
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error("usage: node shot.ts <url> <outPrefix>");
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}.png`, fullPage: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(`${out}.aria.txt`, await page.locator("body").ariaSnapshot());
await browser.close();
console.log(`${out}.png ${out}.aria.txt`);
