import { expect, test } from "@playwright/test";

// Needs the N5 fixture graph loaded (`pnpm --filter @mojibun/content-graph seed:fixture`) and a logged-in Learner.
test("a Learner ticks N5 items, they become Known, and stay locked after a reload", async ({ page }) => {
  await page.goto("/placement");
  await expect(page.getByRole("heading", { name: "Placement" })).toBeVisible();

  const first = page.getByRole("checkbox").first();
  await first.check();
  await page.getByRole("button", { name: /Mark 1 as Known/ }).click();
  await expect(page.getByRole("status")).toHaveText("1 marked as Known.");

  await page.reload();
  const locked = page.getByRole("checkbox").first();
  await expect(locked).toBeChecked();
  await expect(locked).toBeDisabled();
});
