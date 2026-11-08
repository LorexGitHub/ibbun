import { expect, test } from "@playwright/test";

// Runs as a logged-in Learner (playwright.config.ts, project `learner`). A fresh Learner has no Batch Texts yet,
// so the journey accepts the honest empty state, or opens the first episode when the stack has one.
test("a Learner sees their episodes, or is told there are none yet", async ({ page }) => {
  await page.goto("/reading");
  await expect(page.getByRole("heading", { level: 1, name: "Reading" })).toBeVisible();

  const episode = page.getByRole("link", { name: /^Episode \d+:/ }).first();
  const empty = page.getByText(/No stories yet/);
  await expect(episode.or(empty)).toBeVisible();

  if (await episode.isVisible()) {
    await episode.click();
    const hidden = page.getByRole("button", { name: "Show translation" });
    const before = await hidden.count();
    await hidden.first().click();
    await expect(hidden).toHaveCount(before - 1);
  }
});
