import { expect, test } from "@playwright/test";

// Runs in the `learner` project, so the Learner is already logged in (playwright.config.ts).
// Needs the N5 fixture graph loaded (`pnpm --filter @mojibun/content-graph seed:fixture`).
test("a Learner browses a level, searches, and opens a page with a Locked badge and Learn now", async ({ page }) => {
  await page.goto("/browse");
  await expect(page.getByRole("heading", { level: 1, name: "Browse" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanji" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search" }).fill("moon");
  await page.getByRole("link", { name: /月/ }).first().click();

  await expect(page.getByRole("link", { name: "Learn now" })).toHaveAttribute("href", /^\/learn\?now=/);
  await expect(page.getByText("N5", { exact: true })).toBeVisible();
});
