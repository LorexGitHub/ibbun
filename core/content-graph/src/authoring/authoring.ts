import { randomUUID } from "node:crypto";
import type { Decider, DecisionOutcome, GenerationStatus, QueueReason, Verdict } from "./schema.ts";
import { parseLicence } from "../licensing.ts";
import type { Row, Store, TableName, Where } from "./store.ts";

/** Tables whose rows are Content Graph records: an `id`, an approval state and a retired flag. */
export type RecordTable = {
  [N in TableName]: Row<N> extends { id: string; approval: unknown; retired: boolean } ? N : never;
}[TableName];

export type Decision = {
  recordTable: RecordTable;
  recordId: string;
  outcome: DecisionOutcome;
  decider: Decider;
  verdicts?: Verdict[];
  reason?: string | null;
};

export type GenerationRequest = Row<"generationRequest">;
export type GenerationRun = Row<"generationRun">;
export type QueueEntry = Row<"queueEntry">;
export type ApprovalDecision = Row<"approvalDecision">;

export type QueueFilter = { reason?: QueueReason; importRunId?: string; generationRunId?: string };
export type NewQueueEntry = Pick<QueueEntry, "reason"> & Partial<Omit<QueueEntry, "id" | "reason" | "resolved" | "at">>;

export const MAX_ATTEMPTS = 3;
const LIVE: GenerationStatus[] = ["open", "in review"];

/** The `content-graph/authoring` interface: writes, approval, retirement, Generation Requests and the queue. */
export type Authoring = {
  /** Reads every row of a table that matches, drafts, rejected and retired included. */
  rows<N extends TableName>(name: N, where?: Where<N>): Promise<Row<N>[]>;
  insert<N extends TableName>(name: N, rows: Row<N>[]): Promise<void>;
  update<N extends TableName>(name: N, where: Where<N>, patch: Partial<Row<N>>): Promise<void>;

  /** Appends an Approval Decision and moves the record to it. Retiring or rejecting an Example may Suspend its Study Item. */
  decide(decision: Decision): Promise<ApprovalDecision>;
  decisions(recordId: string): Promise<ApprovalDecision[]>;
  /** The outcome of the record's latest decision, or null if none was made. */
  approvalState(recordId: string): Promise<DecisionOutcome | null>;

  /** Suspended: the Study Item has no approved, non-retired Example. */
  isSuspended(studyItemId: string): Promise<boolean>;
  /** Queues `suspended` and a Generation Request for Examples when the Study Item is Suspended. Returns whether it is. */
  checkSuspension(studyItemId: string): Promise<boolean>;

  /** Opens a Generation Request, or returns the one already open for (target, kind). */
  requestGeneration(request: { targetId: string; kind: string; reason: string }): Promise<GenerationRequest>;
  setGenerationStatus(id: string, status: "in review" | "done"): Promise<void>;
  /** Uses one attempt; after the last, the request fails and goes to the queue as `generation failed`. */
  failAttempt(id: string): Promise<GenerationRequest>;
  recordGenerationRun(run: Omit<GenerationRun, "id" | "at">): Promise<GenerationRun>;

  enqueue(entry: NewQueueEntry): Promise<QueueEntry>;
  /** Unresolved queue entries, oldest first. */
  queue(filter?: QueueFilter): Promise<QueueEntry[]>;
  resolve(entryId: string): Promise<void>;
};

export type Clock = { now: () => Date; newId: () => string };
export const systemClock: Clock = { now: () => new Date(), newId: randomUUID };

const byTime = <T extends { at: Date }>(rows: T[]) => rows.sort((a, b) => a.at.getTime() - b.at.getTime());

const RECORD_PATCH: Record<DecisionOutcome, { approval?: "approved" | "rejected"; retired?: boolean }> = {
  approved: { approval: "approved" },
  rejected: { approval: "rejected" },
  escalated: {},
  retired: { retired: true },
};

/** The rules that run inside a caller's transaction. */
const rules = (s: Store, clock: Clock) => {
  const enqueue = async (entry: NewQueueEntry): Promise<QueueEntry> => {
    const row: QueueEntry = {
      id: clock.newId(),
      recordId: null,
      importRunId: null,
      generationRunId: null,
      generationRequestId: null,
      detail: null,
      ...entry,
      resolved: false,
      at: clock.now(),
    };
    await s.insert("queueEntry", [row]);
    return row;
  };

  const requestGeneration = async ({ targetId, kind, reason }: { targetId: string; kind: string; reason: string }) => {
    const live = (await s.rows("generationRequest", { targetId, kind })).find((r) => LIVE.includes(r.status));
    if (live) return live;
    const row: GenerationRequest = { id: clock.newId(), targetId, kind, reason, attempts: 0, status: "open" };
    await s.insert("generationRequest", [row]);
    return row;
  };

  const isSuspended = async (studyItemId: string) =>
    !(await s.rows("example", { studyItemId, approval: "approved", retired: false })).length;

  const checkSuspension = async (studyItemId: string) => {
    if (!(await isSuspended(studyItemId))) return false;
    const queued = await s.rows("queueEntry", { reason: "suspended", recordId: studyItemId, resolved: false });
    if (!queued.length) await enqueue({ reason: "suspended", recordId: studyItemId });
    await requestGeneration({ targetId: studyItemId, kind: "examples", reason: "suspended" });
    return true;
  };

  return { enqueue, requestGeneration, isSuspended, checkSuspension };
};

/** What a decision on an Example sets off: a top-up when one is retired, and Suspension when none is left. */
const afterExampleDecision = async (tx: Store, clock: Clock, exampleId: string, outcome: DecisionOutcome) => {
  const [example] = await tx.rows("example", { id: exampleId });
  if (!example || outcome === "approved") return;
  const r = rules(tx, clock);
  if (outcome === "retired") await r.requestGeneration({ targetId: example.studyItemId, kind: "examples", reason: "example retired" });
  await r.checkSuspension(example.studyItemId);
};

const decide = async (tx: Store, clock: Clock, decision: Decision): Promise<ApprovalDecision> => {
  const row: ApprovalDecision = {
    id: clock.newId(),
    recordTable: decision.recordTable,
    recordId: decision.recordId,
    outcome: decision.outcome,
    decider: decision.decider,
    verdicts: decision.verdicts ?? [],
    reason: decision.reason ?? null,
    at: clock.now(),
  };
  await tx.insert("approvalDecision", [row]);
  const patch = RECORD_PATCH[decision.outcome];
  if (Object.keys(patch).length) await tx.update(decision.recordTable, { id: decision.recordId } as never, patch as never);
  if (decision.outcome === "escalated") await rules(tx, clock).enqueue({ reason: "escalated", recordId: decision.recordId });
  if (decision.recordTable === "example") await afterExampleDecision(tx, clock, decision.recordId, decision.outcome);
  return row;
};

const failAttempt = async (tx: Store, clock: Clock, id: string): Promise<GenerationRequest> => {
  const [request] = await tx.rows("generationRequest", { id });
  if (!request) throw new Error(`no Generation Request ${id}`);
  const attempts = request.attempts + 1;
  const status: GenerationStatus = attempts >= MAX_ATTEMPTS ? "failed" : "open";
  await tx.update("generationRequest", { id }, { attempts, status });
  if (status === "failed") await rules(tx, clock).enqueue({ reason: "generation failed", generationRequestId: id, recordId: request.targetId });
  return { ...request, attempts, status };
};

export const authoring = (s: Store, clock: Clock = systemClock): Authoring => {
  const { enqueue, isSuspended } = rules(s, clock);
  const decisions: Authoring["decisions"] = async (recordId) => byTime(await s.rows("approvalDecision", { recordId }));

  return {
    rows: (name, where) => s.rows(name, where),
    insert: async (name, rows) => {
      if (name === "provenance") for (const row of rows) parseLicence((row as Row<"provenance">).licence);
      await s.insert(name, rows);
    },
    update: async (name, where, patch) => {
      if (name === "provenance" && "licence" in patch) parseLicence(patch.licence);
      await s.update(name, where, patch);
    },

    decide: (decision) => s.atomically((tx) => decide(tx, clock, decision)),
    decisions,
    approvalState: async (recordId) => (await decisions(recordId)).at(-1)?.outcome ?? null,

    isSuspended,
    checkSuspension: (studyItemId) => s.atomically((tx) => rules(tx, clock).checkSuspension(studyItemId)),

    requestGeneration: (request) => s.atomically((tx) => rules(tx, clock).requestGeneration(request)),
    setGenerationStatus: (id, status) => s.update("generationRequest", { id }, { status }),
    failAttempt: (id) => s.atomically((tx) => failAttempt(tx, clock, id)),
    recordGenerationRun: async (run) => {
      const row: GenerationRun = { id: clock.newId(), ...run, at: clock.now() };
      await s.insert("generationRun", [row]);
      return row;
    },

    enqueue,
    queue: async (filter = {}) => byTime(await s.rows("queueEntry", { ...filter, resolved: false })),
    resolve: (id) => s.update("queueEntry", { id }, { resolved: true }),
  };
};
