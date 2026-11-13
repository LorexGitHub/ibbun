import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { LearnerId } from "@ibbun/shared";
import { createQueueApi } from "./queue-api.ts";

const setup = async () => {
  const graph = emptyGraph();
  const authoring = createFakeAuthoring(graph);
  const sessions = createFakeSessionResolver();
  const api = createQueueApi({ authoring, sessions });
  const as = (role: "learner" | "supervisor") => sessions.signIn({ learnerId: LearnerId.parse(randomUUID()), role });
  const get = (path: string, headers: Headers) => api.request(path, { headers });
  const escalated = await authoring.enqueue({ reason: "escalated", recordId: randomUUID() });
  const run = randomUUID();
  const failed = await authoring.enqueue({ reason: "generation failed", generationRunId: run });
  const budget = await authoring.enqueue({ reason: "budget exhausted", detail: { pool: "batch-text" } });
  return { authoring, as, get, api, escalated, failed, budget, run };
};

const ids = async (response: Response) => ((await response.json()) as { entries: { id: string }[] }).entries.map((e) => e.id);

describe("the Content Approval queue", () => {
  it("is for supervisors only", async () => {
    const { api, get, as } = await setup();
    expect((await api.request("/queue")).status).toBe(401);
    expect((await get("/queue", as("learner"))).status).toBe(403);
    expect((await get("/queue", as("supervisor"))).status).toBe(200);
  });

  it("lists entries with their reason and lane: operational reasons go straight to the supervisor", async () => {
    const { get, as } = await setup();
    const body = (await (await get("/queue", as("supervisor"))).json()) as { entries: { reason: string; lane: string; detail: unknown }[] };
    expect(body.entries.map((e) => [e.reason, e.lane])).toEqual([
      ["escalated", "reviewer"],
      ["generation failed", "supervisor"],
      ["budget exhausted", "supervisor"],
    ]);
    expect(body.entries[2]!.detail).toEqual({ pool: "batch-text" });
  });

  it("filters by reason, lane and Generation Run", async () => {
    const { get, as, escalated, failed, budget, run } = await setup();
    const supervisor = as("supervisor");
    expect(await ids(await get("/queue?reason=escalated", supervisor))).toEqual([escalated.id]);
    expect(await ids(await get("/queue?lane=supervisor", supervisor))).toEqual([failed.id, budget.id]);
    expect(await ids(await get("/queue?lane=reviewer", supervisor))).toEqual([escalated.id]);
    expect(await ids(await get(`/queue?generationRunId=${run}`, supervisor))).toEqual([failed.id]);
    expect(await ids(await get("/queue?reason=escalated&lane=supervisor", supervisor))).toEqual([]);
  });

  it("refuses a reason or lane it does not know", async () => {
    const { get, as } = await setup();
    expect((await get("/queue?reason=bogus", as("supervisor"))).status).toBe(400);
    expect((await get("/queue?lane=bogus", as("supervisor"))).status).toBe(400);
  });

  it("resolves an entry, which then leaves the queue", async () => {
    const { api, get, as, escalated } = await setup();
    const supervisor = as("supervisor");
    const resolved = await api.request(`/queue/${escalated.id}/resolve`, { method: "POST", headers: supervisor });
    expect(resolved.status).toBe(200);
    expect(await ids(await get("/queue", supervisor))).not.toContain(escalated.id);
    expect((await api.request(`/queue/${randomUUID()}/resolve`, { method: "POST", headers: supervisor })).status).toBe(404);
    expect((await api.request(`/queue/${escalated.id}/resolve`, { method: "POST", headers: as("learner") })).status).toBe(403);
  });
});
