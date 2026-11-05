import { expect, test as setup } from "@playwright/test";
import { LEARNER_STATE } from "./learner-state.ts";

// The one login through the real form. Every `learner` spec reuses the stored session.
setup("log a Learner in through the login form", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_LEARNER_EMAIL ?? "learner@mojibun.test");
  await page.getByLabel("Password").fill(process.env.E2E_LEARNER_PASSWORD ?? "learner-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: LEARNER_STATE });
});
