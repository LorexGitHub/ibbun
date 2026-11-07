import { expect, test } from "@playwright/test";

// Runs in the `learner` project, already logged in. How much of today's budget is left depends on the
// Learner's log, so the spec checks the screen holds together either way.
test("the learn screen shows the Active Track grid and a batch, or says why there is none", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("link", { name: "Learn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn" })).toBeVisible();
  await expect(page.getByLabel("N5 Words")).toBeVisible();

  const start = page.getByRole("button", { name: "Start batch" });
  const none = page.getByText(/Come back tomorrow|Nothing new is left/);
  await expect(start.or(none)).toBeVisible();
  if (await start.isVisible()) {
    await start.click();
    await expect(page.getByText(/Lesson 1 of/)).toBeVisible();
    await expect(page.getByRole("button", { name: "I know this" })).toBeVisible();
  }
});
