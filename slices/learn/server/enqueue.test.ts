import { describe, expect, it, vi } from "vitest";
import { createFakeJobs } from "@mojibun/jobs";
import { BatchTextGenerate } from "@mojibun/content-graph/jobs";
import { lazyEnqueue } from "./enqueue.ts";

const payload = {
  learnerId: "00000000-0000-4000-8000-000000000001",
  level: "N5" as const,
  itemIds: ["00000000-0000-4000-8000-000000000002"],
};

describe("the lazy queue", () => {
  it("connects on the first enqueue only, and queues through the connection", async () => {
    const jobs = createFakeJobs();
    const connect = vi.fn(async () => jobs);
    const queue = lazyEnqueue("postgres://x", connect);
    expect(connect).not.toHaveBeenCalled();
    await queue.enqueue(BatchTextGenerate, payload as never);
    await queue.enqueue(BatchTextGenerate, payload as never);
    expect(connect).toHaveBeenCalledExactlyOnceWith("postgres://x");
    expect(jobs.pending()).toEqual([BatchTextGenerate.name, BatchTextGenerate.name]);
  });

  it("refuses to enqueue with no database", async () => {
    await expect(lazyEnqueue(undefined, vi.fn()).enqueue(BatchTextGenerate, payload as never)).rejects.toThrow("DATABASE_URL is not set");
  });
});
