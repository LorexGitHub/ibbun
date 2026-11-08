import { isDeepStrictEqual } from "node:util";
import { currentLevel as levelOf } from "../../levels/levels.ts";
import type { Licence } from "../../schema.ts";
import { rules, type Clock } from "../authoring.ts";
import type { QueueReason } from "../schema.ts";
import type { Row, Store } from "../store.ts";
import { COUNT_KEYS, type Counts, type Dataset } from "./types.ts";

export const same = isDeepStrictEqual;

/** What every rule of a run shares: its transaction, its counts, and queue entries tagged with the run. */
const base = (tx: Store, clock: Clock, dataset: Dataset, importRunId: string, senseThreshold: number) => {
  const r = rules(tx, clock, { importRunId });
  return {
    tx,
    clock,
    dataset,
    importRunId,
    senseThreshold,
    r,
    counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as Counts,
    /** Records the run skipped, for the report. */
    notes: [] as string[],
    enqueue: (reason: QueueReason, recordId: string, detail: unknown = null) => r.enqueue({ reason, recordId, detail }),
    sourceKey: (upstreamKey: string, recordId: string) => tx.insert("sourceKey", [{ dataset, upstreamKey, recordId }]),
  };
};
type Base = ReturnType<typeof base>;

const provenances = ({ tx, clock, importRunId }: Base) => {
  const insert = async (source: Row<"provenance">["source"], licence: Licence, author: string | null, sourceUrl: string | null, inputs: string[]) => {
    const id = clock.newId();
    await tx.insert("provenance", [{ id, source, licence, author, sourceUrl, inputs }]);
    return id;
  };
  return {
    /** A new Provenance row pointing at this run. */
    provenance: (licence: Licence, author: string | null = null, sourceUrl: string | null = null) =>
      insert({ kind: "import", importRunId }, licence, author, sourceUrl, []),
    derivedProvenance: (licence: Licence, inputs: string[]) => insert({ kind: "derived", process: "refresh", version: "1" }, licence, null, null, inputs),
  };
};

const overrides = ({ tx, counts, enqueue }: Base) => ({
  /** Re-applies, marks Stale or leaves each active override on a record whose upstream values are now `upstream`. */
  checkOverrides: async (recordId: string, upstream: Record<string, unknown>) => {
    for (const o of await tx.rows("override", { recordId, state: "active" })) {
      if (same(o.basedOn, upstream[o.field])) continue;
      counts.staleOverrides++;
      await tx.update("override", { id: o.id }, { state: "stale" });
      await enqueue("stale override", recordId, { overrideId: o.id, field: o.field });
    }
  },

  /** Orphans every live override on a gone target, suggesting `successor` when there is one. */
  orphanOverrides: async (recordId: string, successor: string | null = null) => {
    for (const o of await tx.rows("override", { recordId })) {
      if (o.state === "orphaned") continue;
      counts.orphanedOverrides++;
      await tx.update("override", { id: o.id }, { state: "orphaned" });
      await enqueue("orphaned override", recordId, { overrideId: o.id, suggestedTarget: successor });
    }
  },
});

const examples = ({ tx, counts, enqueue, r }: Base) => {
  const suspendedBefore = new Map<string, boolean>();
  /** Remembers whether a Study Item was Suspended before this run touched its Examples. */
  const touch = async (studyItemId: string) => {
    if (!suspendedBefore.has(studyItemId)) suspendedBefore.set(studyItemId, await r.isSuspended(studyItemId));
  };
  return {
    touch,

    /** Queues every touched, live Study Item the run left Suspended, and counts the newly Suspended. */
    settleSuspensions: async () => {
      for (const [id, before] of suspendedBefore) {
        const [item] = await tx.rows("studyItem", { id });
        if (!item?.retired && (await r.checkSuspension(id)) && !before) counts.suspended++;
      }
    },

    /** Sends an Example back to Draft and queues it. */
    redraft: async (example: Row<"example">, reason: QueueReason) => {
      await touch(example.studyItemId);
      if (example.approval === "approved") counts.approvedExamplesRedrafted++;
      counts.examplesRedrafted++;
      await tx.update("example", { id: example.id }, { approval: "draft" });
      await enqueue(reason, example.id);
    },
  };
};

/** The Study Item's current JLPT Level, from all its Level Candidates. */
const currentLevel = async (tx: Store, studyItemId: string) => levelOf(await tx.rows("levelCandidate", { studyItemId }));

/** Counts what retiring a levelled Study Item does to the current level, and whether that trips the breaker. */
const countLevelLoss = async (b: Base, id: string, successor: string | null) => {
  if (!(await currentLevel(b.tx, id))) return;
  b.counts.levelsChanged++;
  if (!successor) b.counts.retiredLevelledWithoutSuccessor++;
};

/** One Import Run in progress inside its transaction: what every dataset's rules write through. */
export const runContext = (tx: Store, clock: Clock, dataset: Dataset, importRunId: string, senseThreshold: number) => {
  const b = base(tx, clock, dataset, importRunId, senseThreshold);
  const o = overrides(b);
  return {
    ...b,
    ...provenances(b),
    ...o,
    ...examples(b),
    currentLevel: (studyItemId: string) => currentLevel(tx, studyItemId),

    /** Retires a Study Item and orphans its overrides. */
    retireItem: async (id: string, successor: string | null) => {
      b.counts.retired++;
      await countLevelLoss(b, id, successor);
      await tx.update("studyItem", { id }, { retired: true });
      await o.orphanOverrides(id, successor);
    },
  };
};
export type RunCtx = ReturnType<typeof runContext>;
