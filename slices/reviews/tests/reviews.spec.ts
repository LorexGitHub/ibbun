import { expect, test } from "@playwright/test";

// Runs in the `learner` project, already logged in. Whether Reviews are due depends on the
// Learner's log, so the spec checks the screen holds together either way.
test("the reviews screen shows a Review or says none are due", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page.getByRole("link", { name: "Reviews" })).toBeVisible();
  const empty = page.getByText("No Reviews are due");
  const check = page.getByRole("button", { name: "Check" });
  const listen = page.getByRole("button", { name: "Play", exact: true });
  await expect(empty.or(check).or(listen)).toBeVisible();
  if (await check.isVisible()) {
    await check.click();
    await expect(page.getByRole("alert")).toHaveText("type an answer first");
    await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
  }
});
