import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import type { Db } from "@ibbun/db";
import { connectMatcherRuns } from "./connect.ts";

const db = {} as Db;

describe("connectMatcherRuns", () => {
  it("wires Postgres and the queue without connecting to either", () => {
    expect(Object.keys(connectMatcherRuns(db, {})).sort()).toEqual(["authoring", "jobs"]);
  });

  it("reaches the queue only when a job is enqueued", async () => {
    const { jobs } = connectMatcherRuns(db, {});
    await expect(jobs.enqueue(ContentGenerate, { requestId: randomUUID() })).rejects.toThrow("JOBS_QUEUE_URL is not set");
  });
});
