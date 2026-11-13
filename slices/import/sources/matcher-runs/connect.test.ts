import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import type { Db } from "@ibbun/db";
import { connectMatcherRuns } from "./connect.ts";

const db = {} as Db;

describe("connectMatcherRuns", () => {
  it("wires Postgres and the queue without connecting to either", () => {
    expect(Object.keys(connectMatcherRuns(db, { DATABASE_URL: "postgres://x" })).sort()).toEqual(["authoring", "jobs"]);
  });

  it.each([undefined, ""])("fails naming DATABASE_URL when it is %j", (value) => {
    expect(() => connectMatcherRuns(db, { DATABASE_URL: value })).toThrow("DATABASE_URL is not set");
  });

  it("connects to the queue only when a job is enqueued", async () => {
    const { jobs } = connectMatcherRuns(db, { DATABASE_URL: "postgres://localhost:1/none" });
    await expect(jobs.enqueue(ContentGenerate, { requestId: randomUUID() })).rejects.toThrow();
  });
});
