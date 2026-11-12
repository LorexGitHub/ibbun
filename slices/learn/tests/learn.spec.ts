import { expect, test } from "@playwright/test";

// Runs in the `learner` project, already logged in. What is left to learn depends on the Learner's log, so the
// spec checks the screen holds together with a batch and without one.
test("the learn screen shows where it draws from and the next Study Items, or says nothing is left", async ({ page }) => {
  await page.goto("/learn");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Learn" })).toBeVisible();
  await expect(main.getByRole("radio", { name: "N5" })).toBeChecked();
  await expect(main.getByRole("checkbox", { name: "Words" })).toBeVisible();
  await expect(main.getByText(/today|tomorrow/i)).toHaveCount(0);

  const start = main.getByRole("button", { name: "Start", exact: true });
  const none = main.getByText(/Nothing new is left/);
  await expect(start.or(none)).toBeVisible();
  if (await start.isVisible()) {
    await expect(main.getByRole("list", { name: "Next up" }).getByRole("listitem").first()).toBeVisible();
    await start.click();
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    await main.getByRole("button", { name: "Not yet" }).click();
    await expect(main.getByText("You said: not yet")).toBeVisible();
    await expect(main.getByRole("button", { name: "Mark as Known" })).toBeVisible();
  }
});

test("Learn now opens the lessons of the asked-for item without the start page", async ({ page }) => {
  await page.goto("/learn");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Start", exact: true }).or(main.getByText(/Nothing new is left/))).toBeVisible();
  const id = await page.evaluate(async () => ((await (await fetch("/api/learn/batch")).json()) as { items: { lesson?: { studyItemId: string } }[] }).items[0]?.lesson?.studyItemId);
  test.skip(!id, "no item left to learn now in this Learner's Tracks");
  await page.goto(`/learn?now=${id}`);
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
  await expect(main.getByRole("radio", { name: "N5" })).toBeHidden();
});
