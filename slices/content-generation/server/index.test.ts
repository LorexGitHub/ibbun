import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("the content.generate job as apps load it", () => {
  it("connects to nothing until a job runs, and keeps asking for DATABASE_URL until it is set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { jobs } = await import("./index.ts");
    const [job] = jobs;
    expect(job!.contract.name).toBe("content.generate");

    const payload = { requestId: "00000000-0000-4000-8000-000000000001" };
    await expect(job!.handle(payload)).rejects.toThrow("DATABASE_URL is not set");
    await expect(job!.handle(payload)).rejects.toThrow("DATABASE_URL is not set");
  });
});
