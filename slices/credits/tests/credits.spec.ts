import { expect, test } from "@playwright/test";

test("anyone can open Credits from the footer and see the sources, the level note and the notices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Credits" }).click();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  await expect(page.getByRole("link", { name: "JMdict", exact: true }).first()).toBeVisible();
  await expect(page.getByText("JLPT levels are estimates")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jonathan Waller", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "stephenmk", exact: true })).toBeVisible();
  await expect(page.getByText("National Institute for Japanese Language and Linguistics")).toBeVisible();
});
