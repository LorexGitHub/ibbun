import { expect, test } from "@playwright/test";

// The account slice's one Playwright spec. The default project is a logged-in seed Learner
// (e2e/login.setup.ts); sign-up runs in a fresh browser context and reads its mail from Mailpit.
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "a long and unusual passphrase";

const linkMailedTo = async (request: import("@playwright/test").APIRequestContext, address: string) => {
  for (let tries = 0; tries < 20; tries++) {
    const found = await (await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${address}` } })).json();
    const id = found.messages?.[0]?.ID;
    if (id) {
      const message = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      return /https?:\/\/\S+/.exec(message.Text)![0];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no mail for ${address}`);
};

test.describe("a visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signs up, verifies through the mailed link, and logs in", async ({ page, request }) => {
    const email = `e2e-${Date.now()}@mojibun.test`;
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");

    await page.goto(await linkMailedTo(request, email));
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("gets the same login failure for an unknown address", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@mojibun.test");
    await page.getByLabel("Password").fill("not the password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toHaveText("email or password is wrong");
  });
});

test("settings shows the Learner, their session and their preferences", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("learner@mojibun.test")).toBeVisible();
  await expect(page.getByText("(this device)")).toBeVisible();

  // The boxes are saved at once and redraw from the server's answer, so click and then expect (no check()/uncheck()).
  const english = page.getByLabel("Show the English translation");
  const japanese = page.getByLabel("Show the Japanese Explanation");
  await expect(english).toBeVisible();
  if (await japanese.isChecked()) {
    await japanese.click(); // start from English only, whatever an earlier run left
    await expect(japanese).not.toBeChecked();
  }
  await expect(english).toBeDisabled(); // the only explanation on: it can't be turned off
  await japanese.click();
  await expect(japanese).toBeChecked();
  await expect(english).toBeEnabled();
  await page.reload();
  await expect(japanese).toBeChecked();
  await japanese.click();
  await expect(japanese).not.toBeChecked();
  await expect(english).toBeDisabled();
});
