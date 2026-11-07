import { expect, test } from "@playwright/test";

// The Cram journey as a logged-in Learner (runs in the `learner` project). It needs the N5 fixture graph loaded.
test("choose items, practise them and finish with Mastery untouched", async ({ page }) => {
  await page.goto("/cram");
  await page.getByRole("button", { name: "Choose all shown" }).click();
  await page.getByRole("button", { name: /^Practise \d+ items$/ }).click();

  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.getByText("Not quite.")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
});
