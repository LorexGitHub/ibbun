// Renders each poster div in posters.html to a PNG via Playwright.
// Run: node assets/showcase/render.mjs
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 5000, height: 1300 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(join(here, "posters.html")).href);
await page.waitForTimeout(500); // let fonts settle

const ids = ["reviews", "learn", "reading", "n1", "everyday"];
for (const id of ids) {
  await page.locator(`#${id}`).screenshot({ path: join(here, `poster-${id}.png`) });
  console.log(`poster-${id}.png`);
}
await browser.close();
