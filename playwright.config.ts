import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { LEARNER_STATE } from "./e2e/learner-state.ts";

// The Playwright harness (architecture.md#done-for-a-slice-or-core-change).
// CI starts the Compose services first; webServer below starts the API and the
// web app. Each Learner-facing slice puts one spec in slices/<slice>/tests/.
//
// `setup` logs a Learner in once through the real login form and stores the
// session in LEARNER_STATE; the `learner` project reuses it, so slice specs
// start logged in. The login form belongs to the account slice (#63), so the
// two projects switch on when slices/account exists.
const WEB = "http://localhost:5173";
const API = `http://localhost:${process.env.API_PORT ?? 3000}`;
const hasLoginForm = existsSync("slices/account/register.ts");

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  projects: [
    { name: "anonymous", testMatch: "e2e/**/*.spec.ts" },
    ...(hasLoginForm
      ? [
          { name: "setup", testMatch: "e2e/login.setup.ts" },
          {
            name: "learner",
            testMatch: "slices/*/tests/**/*.spec.ts",
            dependencies: ["setup"],
            use: { storageState: LEARNER_STATE },
          },
        ]
      : []),
  ],
  webServer: [
    { command: "pnpm --filter @ibbun/api start", url: `${API}/api/health`, reuseExistingServer: !process.env.CI },
    { command: "pnpm --filter @ibbun/web dev --port 5173 --strictPort", url: WEB, reuseExistingServer: !process.env.CI },
  ],
});
