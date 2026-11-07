import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { Authoring } from "@mojibun/content-graph/authoring";
import { queuePath, type RunsResponse } from "../contract.ts";
import type { Snapshots } from "./snapshots.ts";

const RUNS_SHOWN = 50;

/** Held runs first, then the live ones, newest first. */
const newestFirst = <T extends { appliedAt: Date | null }>(runs: T[]) =>
  [...runs].sort((a, b) => (b.appliedAt?.getTime() ?? Infinity) - (a.appliedAt?.getTime() ?? Infinity));

/** The Import Run report: supervisors only. */
export const importApi = (deps: { authoring: Pick<Authoring, "rows">; snapshots: Pick<Snapshots, "diffs">; sessions: SessionResolver }) => {
  const { requireRole } = createAuthGuards(deps.sessions);
  return new Hono<AuthEnv>().get("/runs", requireRole("supervisor"), async (c) => {
    const runs = newestFirst(await deps.authoring.rows("importRun")).slice(0, RUNS_SHOWN);
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
