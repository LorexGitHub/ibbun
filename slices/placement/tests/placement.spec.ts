import { expect, test } from "@playwright/test";

// Needs the N5 fixture graph loaded (`pnpm --filter @mojibun/content-graph seed:fixture`) and a logged-in Learner.
test("a Learner taps an N5 tile, saves, and finds it Known and locked after a reload", async ({ page }) => {
  await page.goto("/placement");
  await expect(page.getByRole("heading", { name: "Placement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All of N5 Kanji" })).toBeVisible();

  const wall = page.getByRole("list", { name: "N5 Kanji" });
  const first = wall.getByRole("button").and(page.locator(":enabled")).first();
  const glyph = await first.innerText();
  await first.click();
  await expect(page.getByText("1 to mark as Known")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("1 marked as Known.");

  await page.reload();
  const locked = page.getByRole("list", { name: "N5 Kanji" }).getByRole("button", { name: glyph, exact: true });
  await expect(locked).toBeDisabled();
  await expect(locked).toHaveAttribute("aria-pressed", "true");
});
