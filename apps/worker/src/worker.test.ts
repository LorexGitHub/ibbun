import { createFakeJobs, defineJob, handler } from "@mojibun/jobs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { startWorker } from "./worker.ts";

const Tick = defineJob("test.tick", z.object({ n: z.number() }));

describe("startWorker", () => {
  it("starts the schedules a slice registers, and runs the job when it fires", async () => {
    const seen: number[] = [];
    const jobs = createFakeJobs();
    await startWorker(jobs, [
      {
        name: "clock",
        server: async () => ({ jobs: [handler(Tick, async ({ n }) => void seen.push(n))], schedules: [{ contract: Tick, cron: "0 6 * * 1", payload: { n: 7 } }] }),
      },
    ]);
    expect(jobs.schedules()).toEqual(new Map([["test.tick", "0 6 * * 1"]]));
    await jobs.fire("test.tick");
    await jobs.drain();
    expect(seen).toEqual([7]);
  });

  it("gives every slice the server context", async () => {
    let databaseUrl: string | undefined;
    await startWorker(createFakeJobs(), [{ name: "a", server: async (c) => ((databaseUrl = c.databaseUrl), {}) }], { databaseUrl: "postgres://x" });
    expect(databaseUrl).toBe("postgres://x");
  });
});
