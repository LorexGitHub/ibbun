import { expect, test } from "@playwright/test";

// Runs as a logged-in Learner (playwright.config.ts, project `learner`). A fresh Learner has cleared no level,
// so the journey accepts the locked state, or fills the Generate form when the stack has a Cleared Level.
test("a Learner sees how Practice Texts unlock, or the Generate form", async ({ page }) => {
  await page.goto("/reading/practice");
  await expect(page.getByRole("heading", { level: 1, name: "Practice texts" })).toBeVisible();

  const locked = page.getByText(/once you know every kanji/);
  const generate = page.getByRole("button", { name: "Generate" });
  await expect(locked.or(generate).or(page.getByText("Try again tomorrow."))).toBeVisible();

  if (await generate.isVisible()) {
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByLabel("Topic")).toBeVisible();
  }
});
