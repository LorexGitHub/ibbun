import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { startTestPostgres } from "@mojibun/db/testing";
import { createFakeJobs, createPgBossJobs, defineJob, handler, type FakeJobs, type Jobs } from "./index.ts";

const Greet = defineJob("test.greet", z.object({ name: z.string().min(1), times: z.coerce.number().default(1) }));

const waitFor = async (_jobs: Jobs, check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 100));
  expect(check()).toBe(true);
};

/** Behaviour both implementations must share. `settle` lets the real queue finish in the background. */
const jobsContract = (make: () => Promise<Jobs>, settle: (jobs: Jobs, check: () => boolean) => Promise<void>) => {
  it("runs a queued job with its payload parsed by the contract", async () => {
    const jobs = await make();
    const seen: unknown[] = [];
    await jobs.work([handler(Greet, async (p) => void seen.push(p))]);
    await jobs.enqueue(Greet, { name: "Mika" });
    await settle(jobs, () => seen.length === 1);
    expect(seen).toEqual([{ name: "Mika", times: 1 }]);
    await jobs.stop();
  });

  it("rejects a payload that does not match the contract, and queues nothing", async () => {
    const jobs = await make();
    const seen: unknown[] = [];
    await jobs.work([handler(Greet, async (p) => void seen.push(p))]);
    await expect(jobs.enqueue(Greet, { name: "" })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);
    await jobs.stop();
  });

  it("runs a job queued before its handler was registered", async () => {
    const jobs = await make();
    await jobs.enqueue(Greet, { name: "early" });
    const seen: string[] = [];
    await jobs.work([handler(Greet, async (p) => void seen.push(p.name))]);
    await settle(jobs, () => seen.length === 1);
    expect(seen).toEqual(["early"]);
    await jobs.stop();
  });
};

describe("fake jobs", () => {
  jobsContract(async () => createFakeJobs(), async (jobs) => (jobs as FakeJobs).drain());

  it("drains jobs that handlers enqueue, and reports what is pending", async () => {
    const jobs = createFakeJobs();
    const Second = defineJob("test.second", z.object({}));
    const ran: string[] = [];
    await jobs.enqueue(Second, {});
    expect(jobs.pending()).toEqual(["test.second"]);
    await jobs.work([
      handler(Greet, async () => {
        ran.push("greet");
        await jobs.enqueue(Second, {});
      }),
      handler(Second, async () => void ran.push("second")),
    ]);
    await jobs.enqueue(Greet, { name: "x" });
    await jobs.drain();
    expect(ran).toEqual(["second", "greet", "second"]);
    expect(jobs.pending()).toEqual([]);
  });

  it("lets a handler error surface from drain", async () => {
    const jobs = createFakeJobs();
    await jobs.work([handler(Greet, async () => Promise.reject(new Error("boom")))]);
    await jobs.enqueue(Greet, { name: "x" });
    await expect(jobs.drain()).rejects.toThrow("boom");
  });
});

describe("pg-boss jobs, against Postgres", () => {
  let pg: Awaited<ReturnType<typeof startTestPostgres>>;
  beforeAll(async () => {
    pg = await startTestPostgres();
  });
  afterAll(() => pg.stop());

  jobsContract(() => createPgBossJobs(pg.url, { max: 1 }), waitFor);
});
