import { afterEach, describe, expect, it, vi } from "vitest";
import { liveGraph } from "./index.ts";

afterEach(() => vi.unstubAllEnvs());

describe("the live graph", () => {
  it("refuses to start without DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => liveGraph()).toThrow(/DATABASE_URL is not set/);
  });

  it("is created once and reused", () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:1/none");
    expect(liveGraph()).toBe(liveGraph());
  });
});
