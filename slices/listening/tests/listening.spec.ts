import { expect, test } from "@playwright/test";

// Runs as a logged-in Learner (playwright.config.ts, project `learner`). The stack's seed decides whether
// N5 has playable clips, so the journey accepts either a clip to hear or the honest empty state.
test("a Learner opens Listening on a clip to hear, or is told there are none", async ({ page }) => {
  await page.goto("/listening");
  await expect(page.getByRole("heading", { name: "Listening", exact: true })).toBeVisible();

  // N5 is chosen without a click, and no list of clips stands between the Learner and the player.
  await expect(page.getByRole("button", { name: "N5" })).toHaveAttribute("aria-pressed", "true");

  const play = page.getByRole("button", { name: "Play", exact: true });
  const empty = page.getByText("No N5 clips yet.");
  await expect(play.or(empty)).toBeVisible();

  if (await play.isVisible()) {
    await expect(page.getByRole("group", { name: "Speed" })).toBeVisible();
    // The transcript stays hidden until the Learner has answered.
    await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByText("Not quite")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next clip" })).toBeVisible();
  }
});

// A fresh Learner has no Cleared Level, so the stack's seed decides which of the two states shows.
test("a Learner sees how to unlock practice dialogues, or the Generate form for a Cleared Level", async ({ page }) => {
  await page.goto("/listening");
  await expect(page.getByRole("heading", { name: "Practice dialogues" })).toBeVisible();

  const locked = page.getByText(/Know every Kanji of a level/);
  const generate = page.getByRole("button", { name: "Generate a dialogue" });
  await expect(locked.or(generate)).toBeVisible();
});
