import { expect, test } from "@playwright/test";

// Runs as a logged-in Learner (playwright.config.ts, project `learner`). A fresh Learner has no Batch Texts yet,
// so the journey accepts the honest empty state, or reads the newest story when the stack has one.
test("a Learner reads their newest story, or is told there are none yet", async ({ page }) => {
  await page.goto("/reading");
  await expect(page.getByRole("heading", { level: 1, name: "Reading" })).toBeVisible();

  const newest = page.getByRole("link", { name: "Read", exact: true });
  const empty = page.getByText(/No stories yet/);
  await expect(newest.or(empty)).toBeVisible();

  if (await newest.isVisible()) {
    await newest.click();
    await expect(page.getByRole("button", { name: "Furigana" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Translation" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("complementary", { name: "Words" })).toHaveCount(0);
    await page.getByRole("button", { name: "Words" }).click();
    await expect(page.getByRole("complementary", { name: "Words" })).toBeVisible();
  }
});
