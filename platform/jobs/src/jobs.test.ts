import { GetQueueAttributesCommand, ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFakeJobs, createSqsJobs, createSqsJobsFromEnv, defineJob, handler, sqsHandler, type FakeJobs, type Jobs } from "./index.ts";
import { MAX_RECEIVES, startTestQueue, type TestQueue } from "./testing.ts";

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

  it("queues a scheduled job with its payload when it fires, and rejects a payload the contract refuses", async () => {
    const jobs = createFakeJobs();
    const seen: string[] = [];
    await jobs.work([handler(Greet, async (p) => void seen.push(p.name))]);
    await jobs.schedule(Greet, "0 6 * * 1", { name: "weekly" });
    expect(jobs.schedules()).toEqual(new Map([["test.greet", "0 6 * * 1"]]));
    expect(seen).toEqual([]);
    await jobs.fire("test.greet");
    await jobs.drain();
    expect(seen).toEqual(["weekly"]);
    await expect(jobs.schedule(Greet, "0 6 * * 1", { name: "" })).rejects.toThrow();
    await expect(jobs.fire("test.none")).rejects.toThrow("no schedule for test.none");
  });

  it("lets a handler error surface from drain", async () => {
    const jobs = createFakeJobs();
    await jobs.work([handler(Greet, async () => Promise.reject(new Error("boom")))]);
    await jobs.enqueue(Greet, { name: "x" });
    await expect(jobs.drain()).rejects.toThrow("boom");
  });
});

describe("SQS jobs, against ElasticMQ", () => {
  const opened: { queue: TestQueue; jobs: Jobs[] }[] = [];
  const open = async (visibilitySeconds = 30) => {
    const queue = await startTestQueue(visibilitySeconds);
    opened.push({ queue, jobs: [] });
    return queue;
  };
  const jobsOn = (queue: TestQueue) => {
    const jobs = createSqsJobs({ client: queue.client, queueUrl: queue.queueUrl, waitSeconds: 1 });
    opened.at(-1)!.jobs.push(jobs);
    return jobs;
  };
  afterEach(async () => {
    for (const { queue, jobs } of opened.splice(0)) {
      for (const j of jobs) await j.stop();
      await queue.stop();
    }
  });
  const waiting = async (queueUrl: string, queue: TestQueue) => {
    const { Attributes } = await queue.client.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"] }),
    );
    return Number(Attributes!.ApproximateNumberOfMessages) + Number(Attributes!.ApproximateNumberOfMessagesNotVisible);
  };

  jobsContract(async () => jobsOn(await open()), waitFor);

  it("deletes a job once its handler succeeds", async () => {
    const queue = await open();
    const jobs = jobsOn(queue);
    let ran = 0;
    await jobs.work([handler(Greet, async () => void ran++)]);
    await jobs.enqueue(Greet, { name: "once" });
    await waitFor(jobs, () => ran === 1);
    await jobs.stop();
    expect(await waiting(queue.queueUrl, queue)).toBe(0);
  });

  it("delivers a failing job again, and moves it to the dead-letter queue after three receives", async () => {
    const queue = await open(1);
    const jobs = jobsOn(queue);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let tries = 0;
    await jobs.work([handler(Greet, async () => ((tries += 1), Promise.reject(new Error("boom"))))]);
    await jobs.enqueue(Greet, { name: "doomed" });
    await waitFor(jobs, () => tries === MAX_RECEIVES);
    await new Promise((r) => setTimeout(r, 2500));
    await jobs.stop();
    error.mockRestore();
    expect(tries).toBe(MAX_RECEIVES);
    const { Messages = [] } = await queue.client.send(new ReceiveMessageCommand({ QueueUrl: queue.deadLetterUrl, WaitTimeSeconds: 1 }));
    expect(Messages.map((m) => JSON.parse(m.Body!))).toEqual([{ name: "test.greet", payload: { name: "doomed", times: 1 } }]);
  });

  it("queues a scheduled job on its cron, and a second schedule for the job replaces the first", async () => {
    const queue = await open();
    const jobs = jobsOn(queue);
    const seen: string[] = [];
    await jobs.work([handler(Greet, async (p) => void seen.push(p.name))]);
    await jobs.schedule(Greet, "* * * * * *", { name: "old" });
    await jobs.schedule(Greet, "* * * * * *", { name: "new" });
    await expect(jobs.schedule(Greet, "* * * * * *", { name: "" })).rejects.toThrow();
    await waitFor(jobs, () => seen.length >= 2);
    expect(new Set(seen)).toEqual(new Set(["new"]));
  });

  it("stops firing schedules once stopped", async () => {
    const queue = await open();
    const jobs = jobsOn(queue);
    await jobs.schedule(Greet, "* * * * * *", { name: "tick" });
    await jobs.stop();
    await new Promise((r) => setTimeout(r, 1500));
    expect(await waiting(queue.queueUrl, queue)).toBe(0);
  });

  it("keeps polling after the queue fails to answer, and still stops", async () => {
    const queue = await open();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const jobs = createSqsJobs({ client: queue.client, queueUrl: `${queue.queueUrl}-missing`, waitSeconds: 1 });
    await jobs.work([handler(Greet, async () => {})]);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("jobs: receiving from the queue failed:", expect.anything()), { timeout: 5000 });
    await jobs.stop();
    error.mockRestore();
  });

  it("reads the queue from JOBS_QUEUE_URL, and fails on first use without it", async () => {
    const queue = await open();
    const jobs = createSqsJobsFromEnv({ JOBS_QUEUE_URL: queue.queueUrl });
    await jobs.enqueue(Greet, { name: "env" });
    expect(await waiting(queue.queueUrl, queue)).toBe(1);
    const unset = createSqsJobsFromEnv({});
    await expect(unset.enqueue(Greet, { name: "x" })).rejects.toThrow("JOBS_QUEUE_URL is not set");
    await expect(unset.schedule(Greet, "* * * * *", { name: "x" })).rejects.toThrow("JOBS_QUEUE_URL is not set");
    await expect(unset.work([])).rejects.toThrow("JOBS_QUEUE_URL is not set");
    await expect(unset.stop()).resolves.toBeUndefined();
  });

  it("runs a Lambda batch from the queue, reporting only the records that failed", async () => {
    const queue = await open();
    const send = (body: string) => queue.client.send(new SendMessageCommand({ QueueUrl: queue.queueUrl, MessageBody: body }));
    const jobs = jobsOn(queue);
    await jobs.enqueue(Greet, { name: "ok" });
    await jobs.enqueue(Greet, { name: "fail" });
    await send(JSON.stringify({ name: "test.unknown", payload: {} }));
    await send(JSON.stringify({ name: "test.greet", payload: { name: "" } }));
    await send("not json");
    const { Messages = [] } = await queue.client.send(new ReceiveMessageCommand({ QueueUrl: queue.queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }));
    expect(Messages).toHaveLength(5);
    const records = Messages.map((m) => ({ messageId: m.MessageId!, body: m.Body! }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const handle = sqsHandler([handler(Greet, async (p) => (p.name === "fail" ? Promise.reject(new Error("no")) : void seen.push(p.name)))]);
    const { batchItemFailures } = await handle({ Records: records });
    error.mockRestore();
    expect(seen).toEqual(["ok"]);
    const ok = records.find((r) => r.body.includes('"ok"'))!.messageId;
    expect(batchItemFailures.map((f) => f.itemIdentifier).sort()).toEqual(records.map((r) => r.messageId).filter((id) => id !== ok).sort());
  });
});
