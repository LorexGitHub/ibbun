import { expect, test } from "@playwright/test";

// Runs in the `learner` project, so the Learner is already logged in (playwright.config.ts).
test("a Learner lands on Today and sees what is due and their way up the JLPT Levels", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible();
  await expect(page.getByText(/^(Nothing waits for you today\.|reviews? waits? for you\.)$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Reviews" })).toHaveAttribute("href", "/reviews");
  await expect(page.getByRole("heading", { name: "Your way up to N1" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^N5/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
});

test("a Learner opens a JLPT Level from Today and finds its progress and its doors", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: /^N5 \d+% · / }).click();

  await expect(page).toHaveURL(/\/level\/n5$/);
  await expect(page.getByRole("heading", { level: 1, name: "N5" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem")).toHaveText([/^Kanji/, /^Words/, /^Grammar/]);
  const doors = page.getByRole("navigation", { name: "Doors at N5" });
  await expect(doors.getByRole("link")).toHaveText([/Reviews/, /Learn/, /Reading/, /Listening/, /Placement/]);
  await expect(doors.getByRole("link", { name: /Reviews/ })).toHaveAttribute("href", "/reviews?level=n5");
});
