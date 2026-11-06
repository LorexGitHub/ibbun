import type { Row } from "../store.ts";
import { matchSenses, pairs, successorKey } from "./match.ts";
import { same, type RunCtx } from "./run.ts";
import type { WordRecord } from "./types.ts";

type Life = { approval: "approved"; retired: false; provenanceId: string };
type Sub = "wordForm" | "wordReading";
type SubFields = { wordForm: object; wordReading: { pitchAccent: number[] | null } };

const live = async (ctx: RunCtx, wordId: string) => ({
  forms: (await ctx.tx.rows("wordForm", { wordId, retired: false })).sort((a, b) => a.position - b.position),
  readings: (await ctx.tx.rows("wordReading", { wordId, retired: false })).sort((a, b) => a.position - b.position),
  senses: (await ctx.tx.rows("wordSense", { wordId, retired: false })).sort((a, b) => a.position - b.position),
});

const asRecord = (key: string, priorityTags: string[], rows: Awaited<ReturnType<typeof live>>): WordRecord => ({
  key,
  forms: rows.forms.map((f) => f.text),
  readings: rows.readings.map((r) => ({ text: r.text, pitchAccent: r.pitchAccent })),
  senses: rows.senses.map((s) => ({ partsOfSpeech: s.partsOfSpeech, glosses: s.glosses })),
  priorityTags,
});

/** Forms and readings keep their ID when their text survives; the rest are retired with their overrides orphaned. */
const syncByText = async <N extends Sub>(ctx: RunCtx, name: N, wordId: string, old: Row<N>[], next: (SubFields[N] & { text: string })[], life: Life) => {
  for (const [position, entry] of next.entries()) {
    const kept = old.find((o) => o.text === entry.text);
    if (!kept) {
      await ctx.tx.insert(name, [{ id: ctx.clock.newId(), wordId, position, ...entry, ...life } as Row<N>]);
      continue;
    }
    await ctx.tx.update(name, { id: kept.id } as never, { position, ...entry, provenanceId: life.provenanceId } as never);
    await ctx.checkOverrides(kept.id, entry);
  }
  for (const gone of old.filter((o) => !next.some((n) => n.text === o.text))) {
    await ctx.tx.update(name, { id: gone.id } as never, { retired: true } as never);
    await ctx.orphanOverrides(gone.id);
  }
};

/** What hangs off a sense with no confident match goes back to Draft, queued `unmatched sense`; never re-pointed. */
const unmatchSense = async (ctx: RunCtx, sense: Row<"wordSense">) => {
  ctx.counts.unmatchedSenses++;
  await ctx.tx.update("wordSense", { id: sense.id }, { retired: true });
  await ctx.orphanOverrides(sense.id);
  for (const e of await ctx.tx.rows("japaneseExplanation", { wordSenseId: sense.id })) {
    await ctx.tx.update("japaneseExplanation", { id: e.id }, { approval: "draft" });
    await ctx.enqueue("unmatched sense", e.id, { senseId: sense.id });
  }
  for (const l of await ctx.tx.rows("sentenceUsesWord", { senseId: sense.id })) {
    await ctx.tx.update("sentenceUsesWord", { id: l.id }, { approval: "draft" });
    await ctx.enqueue("unmatched sense", l.id, { senseId: sense.id });
  }
  for (const e of await ctx.tx.rows("example", { targetSenseId: sense.id })) await ctx.redraft(e, "unmatched sense");
};

const syncSenses = async (ctx: RunCtx, wordId: string, old: Row<"wordSense">[], next: WordRecord["senses"], life: Life) => {
  const matches = matchSenses(old, next, ctx.senseThreshold);
  for (const [position, sense] of next.entries()) {
    const kept = matches[position];
    if (kept == null) {
      await ctx.tx.insert("wordSense", [{ id: ctx.clock.newId(), wordId, position, ...sense, ...life }]);
      continue;
    }
    await ctx.tx.update("wordSense", { id: old[kept]!.id }, { position, ...sense, provenanceId: life.provenanceId });
    await ctx.checkOverrides(old[kept]!.id, sense);
  }
  for (const [i, sense] of old.entries()) if (!matches.includes(i)) await unmatchSense(ctx, sense);
};

const life = async (ctx: RunCtx): Promise<Life> => ({ approval: "approved", retired: false, provenanceId: await ctx.provenance("edrdg") });

const write = async (ctx: RunCtx, wordId: string, record: WordRecord, old: Awaited<ReturnType<typeof live>>, l: Life) => {
  await syncByText(ctx, "wordForm", wordId, old.forms, record.forms.map((text) => ({ text })), l);
  await syncByText(ctx, "wordReading", wordId, old.readings, record.readings, l);
  await syncSenses(ctx, wordId, old.senses, record.senses, l);
};

export const jmdict = {
  add: async (ctx: RunCtx, record: WordRecord) => {
    const id = ctx.clock.newId();
    const l = await life(ctx);
    await ctx.tx.insert("studyItem", [{ id, type: "word", ...l }]);
    await ctx.tx.insert("word", [{ studyItemId: id, priorityTags: record.priorityTags }]);
    await write(ctx, id, record, { forms: [], readings: [], senses: [] }, l);
    await ctx.sourceKey(record.key, id);
    return id;
  },

  /** Replaces the imported data wholesale, matching sub-entries inside the record. Returns whether anything changed. */
  change: async (ctx: RunCtx, id: string, record: WordRecord) => {
    const [item] = await ctx.tx.rows("studyItem", { id });
    const [word] = await ctx.tx.rows("word", { studyItemId: id });
    const old = await live(ctx, id);
    if (!item!.retired && same(asRecord(record.key, word!.priorityTags, old), record)) return false;
    const l = await life(ctx);
    await ctx.tx.update("studyItem", { id }, { retired: false, provenanceId: l.provenanceId });
    await ctx.tx.update("word", { studyItemId: id }, { priorityTags: record.priorityTags });
    await ctx.checkOverrides(id, { priorityTags: record.priorityTags });
    await write(ctx, id, record, old, l);
    return true;
  },

  /** Retires a gone entry and, when every pair it had lives on in one entry, links and hands over to that successor. */
  retire: async (ctx: RunCtx, id: string, surviving: WordRecord[], idOf: (key: string) => string) => {
    const old = await live(ctx, id);
    const key = successorKey(pairs(old.forms.map((f) => f.text), old.readings.map((r) => r.text)), surviving);
    const successor = key === null ? null : idOf(key);
    await ctx.retireItem(id, successor);
    for (const sub of [...old.forms, ...old.readings, ...old.senses]) await ctx.orphanOverrides(sub.id, successor);
    if (successor) await supersede(ctx, id, successor);
  },
};

/** The derived link, the Approved Examples as Drafts, and the current level as a Draft Editorial candidate. */
const supersede = async (ctx: RunCtx, retiredWordId: string, wordId: string) => {
  ctx.counts.superseded++;
  const provenanceId = await ctx.derivedProvenance("edrdg", [retiredWordId, wordId]);
  const draft = { approval: "draft" as const, retired: false, provenanceId };
  await ctx.tx.insert("wordSupersededBy", [{ id: ctx.clock.newId(), retiredWordId, wordId, ...draft, approval: "approved" }]);
  for (const e of await ctx.tx.rows("example", { studyItemId: retiredWordId, approval: "approved", retired: false })) {
    const copy = { ...e, id: ctx.clock.newId(), studyItemId: wordId, targetSenseId: null, ...draft };
    await ctx.tx.insert("example", [copy]);
    await ctx.enqueue("superseded", copy.id, { from: e.id, retiredWordId });
  }
  const level = await ctx.currentLevel(retiredWordId);
  if (level) await ctx.tx.insert("levelCandidate", [{ id: ctx.clock.newId(), studyItemId: wordId, level, kind: "editorial", ...draft }]);
};
