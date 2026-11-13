import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@ibbun/auth";
import type { Authoring } from "@ibbun/content-graph/authoring";
import { queuePath, type RunsResponse } from "../contract.ts";
import type { Snapshots } from "./snapshots.ts";

const RUNS_SHOWN = 50;

/** Sort key for "held first, then newest": a run not yet applied sorts before every date. */
const recency = (run: { appliedAt: Date | null }) => (run.appliedAt ? run.appliedAt.getTime() : Number.MAX_SAFE_INTEGER);

/** The Import Run report: supervisors only. */
export const importApi = (deps: { authoring: Pick<Authoring, "rows">; snapshots: Pick<Snapshots, "diffs">; sessions: SessionResolver }) => {
  const { requireRole } = createAuthGuards(deps.sessions);
  return new Hono<AuthEnv>().get("/runs", requireRole("supervisor"), async (c) => {
    const runs = (await deps.authoring.rows("importRun")).sort((a, b) => recency(b) - recency(a)).slice(0, RUNS_SHOWN);
    const diffs = await deps.snapshots.diffs(runs.map((r) => r.id));
    const body: RunsResponse = {
      runs: runs.map((r) => ({
        id: r.id,
        dataset: r.dataset,
        upstreamVersion: r.upstreamVersion,
        status: r.status,
        appliedAt: r.appliedAt?.toISOString() ?? null,
        counts: r.counts,
        diff: diffs.get(r.id) ?? null,
        queuePath: queuePath(r.id),
      })),
    };
    return c.json(body);
  });
};
