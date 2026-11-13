import { expect, test } from "@playwright/test";

// Runs in the `learner` project, so the Learner is already logged in (playwright.config.ts).
// Needs the N5 fixture graph loaded (`pnpm --filter @ibbun/content-graph seed:fixture`).
test("a Learner sees the Mastery wall, searches it, and opens a tile as a sheet with Learn now", async ({ page }) => {
  await page.goto("/browse");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Kanji" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "N5 Kanji" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search" }).fill("moon");
  await page.getByRole("button", { name: /^月/ }).click();

  const sheet = page.getByRole("dialog", { name: "Study Item" });
  await expect(sheet.getByRole("link", { name: "Learn now" })).toHaveAttribute("href", /^\/learn\?now=/);
  await expect(sheet.getByRole("link", { name: "Cram this" })).toHaveAttribute("href", /^\/cram\?items=/);
  await expect(sheet.getByText("N5", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
