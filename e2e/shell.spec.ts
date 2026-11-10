import { expect, test } from "@playwright/test";

// Proves the harness: the stack is up, the web app renders, and its /api proxy reaches the API.
test("the web app loads and reaches the API", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
  // The dock is for logged-in Learners only
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
});
