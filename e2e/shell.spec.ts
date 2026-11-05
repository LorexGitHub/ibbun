import { expect, test } from "@playwright/test";

// Proves the harness: the stack is up, the web app renders, and its /api proxy reaches the API.
test("the web app loads and reaches the API", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("nav")).toBeAttached();
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
});
