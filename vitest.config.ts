import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["{apps,core,platform,slices,scripts}/**/*.test.{ts,tsx}"], testTimeout: 30_000 },
});
