import { configDefaults, defineConfig } from "vitest/config";

// Matches from whatever directory Vitest starts in, so the same config serves a
// run over the whole repo and a run inside one package
// (scripts/gates/vitest-per-package.ts, mutator's per-package test command).
export default defineConfig({
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/target/**", "**/.metrics/**"],
    testTimeout: 30_000,
  },
});
