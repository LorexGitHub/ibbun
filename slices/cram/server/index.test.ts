import { afterEach, describe, expect, it, vi } from "vitest";
import slice from "../register.ts";
import { api } from "./index.ts";

afterEach(() => vi.unstubAllEnvs());

describe("the cram slice as the API shell mounts it", () => {
  it("is registered as `cram`, with a nav entry and both parts", async () => {
    expect(slice).toMatchObject({ name: "cram", nav: { label: "Cram", path: "/cram" } });
    expect((await slice.server!()).api).toBe(api);
    expect((await slice.web!()).routes?.map((r) => r.path)).toEqual(["/cram"]);
  });

  it("answers 503 for Cram alone while the environment is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const res = await api.request("/items?level=N5");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ message: "Cram is unavailable" });
  });
});
