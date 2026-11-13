import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@ibbun/auth";
import { QUEUE_REASONS, type Authoring, type QueueEntry, type QueueFilter, type QueueReason } from "@ibbun/content-graph/authoring";

/** These always go straight to the supervisor; the reviewer agent never handles them (docs/content-approval.md#what-it-handles). */
export const OPERATIONAL: readonly QueueReason[] = ["breaker tripped", "budget exhausted", "generation failed", "staleness alarm"];

export type Lane = "supervisor" | "reviewer";
const laneOf = (reason: QueueReason): Lane => (OPERATIONAL.includes(reason) ? "supervisor" : "reviewer");

const present = (e: QueueEntry) => ({ ...e, lane: laneOf(e.reason), at: e.at.toISOString() });

const isReason = (value: string): value is QueueReason => (QUEUE_REASONS as readonly string[]).includes(value);

const isLane = (value: string): value is Lane => value === "supervisor" || value === "reviewer";

type Parsed = { error: string } | { filter: QueueFilter; lane?: Lane };

const parseQuery = ({ reason, lane, generationRunId, importRunId }: Record<string, string>): Parsed => {
  if (reason && !isReason(reason)) return { error: `unknown reason "${reason}"` };
  if (lane && !isLane(lane)) return { error: `unknown lane "${lane}"` };
  const filter: QueueFilter = { ...(reason && { reason: reason as QueueReason }), ...(generationRunId && { generationRunId }), ...(importRunId && { importRunId }) };
  return { filter, lane: lane as Lane | undefined };
};

/** The Content Approval queue for the supervisor: entries with reasons, filters by reason, lane and run, and resolving. */
export const createQueueApi = ({ authoring, sessions }: { authoring: Authoring; sessions: SessionResolver }): Hono => {
  const api = new Hono<AuthEnv>()
    .use(createAuthGuards(sessions).requireRole("supervisor"))
    .get("/queue", async (c) => {
      const parsed = parseQuery(c.req.query());
      if ("error" in parsed) return c.json({ message: parsed.error }, 400);
      const entries = (await authoring.queue(parsed.filter)).filter((e) => !parsed.lane || laneOf(e.reason) === parsed.lane).map(present);
      return c.json({ reasons: QUEUE_REASONS, entries });
    })
    .post("/queue/:id/resolve", async (c) => {
      const [entry] = await authoring.rows("queueEntry", { id: c.req.param("id") });
      if (!entry) return c.json({ message: "no such queue entry" }, 404);
      await authoring.resolve(entry.id);
      return c.json({ resolved: entry.id });
    });
  // The shell mounts a plain Hono; the guard's session variable is read only inside this app.
  return api as unknown as Hono;
};
