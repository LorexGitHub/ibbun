import { expect, test } from "@playwright/test";

// Runs in the `learner` project, so the Learner is already logged in (playwright.config.ts).
test("a Learner lands on Today and sees what is due and their way up the JLPT Levels", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible();
  await expect(page.getByText(/^(Nothing waits for you today\.|reviews? waits? for you\.)$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start reviews" })).toHaveAttribute("href", "/reviews");
  await expect(page.getByRole("heading", { name: "Your way up to N1" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^N5/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
});
