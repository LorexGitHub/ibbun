import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeAuthoring, emptyGraph } from "@mojibun/content-graph/testing";
import { LearnerId } from "@mojibun/shared";
import { RunsResponse } from "../contract.ts";
import { importApi } from "./api.ts";
import { memorySnapshots } from "./snapshots.ts";

const setup = async () => {
  const graph = emptyGraph();
  const held = randomUUID();
  const live = randomUUID();
  graph.importRun.push(
    { id: live, dataset: "jmdict", upstreamVersion: "3.6.2", checksum: "c", status: "applied", counts: { added: 5, retired: 1 }, appliedAt: new Date("2026-11-02T12:00:00Z") },
    { id: held, dataset: "jmdict", upstreamVersion: "3.6.3", checksum: "c", status: "breaker tripped", counts: { retired: 90 }, appliedAt: null },
  );
  const snapshots = memorySnapshots();
  await snapshots.saveDiff(live, { added: ["1"], changed: [], gone: [] });
  const sessions = createFakeSessionResolver();
  const app = importApi({ authoring: createFakeAuthoring(graph), snapshots, sessions });
  const as = (role: "learner" | "supervisor") => sessions.signIn({ learnerId: LearnerId.parse(randomUUID()), role });
  return { app, as, live, held };
};

describe("GET /runs", () => {
  it("lists runs, held ones first, each with its counts, its diff and a link into the queue filtered to the run", async () => {
    const { app, as, live, held } = await setup();
    const response = await app.request("/runs", { headers: as("supervisor") });
    expect(response.status).toBe(200);
    const { runs } = RunsResponse.parse(await response.json());
    expect(runs.map((r) => [r.id, r.status])).toEqual([[held, "breaker tripped"], [live, "applied"]]);
    expect(runs[1]).toMatchObject({ counts: { added: 5, retired: 1 }, diff: { added: 1, changed: 0, gone: 0 }, appliedAt: "2026-11-02T12:00:00.000Z", queuePath: `/admin/content-approval?importRun=${live}` });
    expect(runs[0]).toMatchObject({ diff: null, appliedAt: null });
  });

  it("answers 401 without a session and 403 to a plain Learner", async () => {
    const { app, as } = await setup();
    expect((await app.request("/runs")).status).toBe(401);
    expect((await app.request("/runs", { headers: as("learner") })).status).toBe(403);
  });
});
