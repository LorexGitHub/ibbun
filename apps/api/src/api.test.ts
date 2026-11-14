import { describe, expect, it } from "vitest";
import { createApi } from "./api.ts";

describe("createApi", () => {
  it("refuses to start without a database", async () => {
    await expect(createApi({ AUTH_SECRET: "k".repeat(32), APP_URL: "https://m.example" })).rejects.toThrow("DATABASE_URL is not set");
  });
});
