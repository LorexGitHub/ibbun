import type { Row } from "../store.ts";
import type { RunCtx } from "./run.ts";
import type { KanjiLevelRecord } from "./types.ts";

const TANOS_URL = "https://web.archive.org/web/20200117222855/http://www.tanos.co.uk/jlpt/";
const provenance = (ctx: RunCtx) => ctx.provenance("cc-by", "Jonathan Waller", TANOS_URL);

/** Runs `write`, and counts the Study Item as level-changed when its current level differs afterwards. */
const settleLevel = async (ctx: RunCtx, studyItemId: string, write: () => Promise<unknown>) => {
  const before = await ctx.currentLevel(studyItemId);
  await write();
  if (before !== (await ctx.currentLevel(studyItemId))) ctx.counts.levelsChanged++;
};

/** The live Kanji with this literal, or null. Throws when KANJIDIC2 has not been imported at all, since every record would be skipped. */
const kanjiFor = async (ctx: RunCtx, literal: string) => {
  const [key] = await ctx.tx.rows("sourceKey", { dataset: "kanjidic", upstreamKey: literal });
  const [kanji] = key ? await ctx.tx.rows("studyItem", { id: key.recordId }) : [];
  if (kanji && !kanji.retired) return kanji;
  if ((await ctx.tx.rows("sourceKey", { dataset: "kanjidic" })).length === 0) throw new Error("import KANJIDIC2 first: there are no Kanji to attach levels to");
  return null;
};

/**
 * Tanos kanji lists: each record is one List Level Candidate on the Kanji with that literal. The source key points at
 * the candidate, so a refresh rewrites only this source's candidates and never an Editorial one.
 */
export const tanos = {
  add: async (ctx: RunCtx, record: KanjiLevelRecord) => {
    const kanji = await kanjiFor(ctx, record.key);
    if (!kanji) {
      ctx.notes.push(`${record.key} is not in KANJIDIC2: skipped`);
      return null;
    }
    const id = ctx.clock.newId();
    const provenanceId = await provenance(ctx);
    await settleLevel(ctx, kanji.id, () =>
      ctx.tx.insert("levelCandidate", [{ id, studyItemId: kanji.id, level: record.level, kind: "list", approval: "approved", retired: false, provenanceId }]),
    );
    await ctx.sourceKey(record.key, id);
    return id;
  },

  change: async (ctx: RunCtx, id: string, record: KanjiLevelRecord) => {
    const [old] = (await ctx.tx.rows("levelCandidate", { id })) as [Row<"levelCandidate">];
    if (!old.retired && old.level === record.level) return false;
    await settleLevel(ctx, old.studyItemId, async () =>
      ctx.tx.update("levelCandidate", { id }, { level: record.level, retired: false, provenanceId: await provenance(ctx) }),
    );
    return true;
  },

  /** The list dropped the Kanji: its List candidate is Retired, and the Kanji keeps whatever level its other candidates give. */
  retire: async (ctx: RunCtx, id: string) => {
    const [old] = (await ctx.tx.rows("levelCandidate", { id })) as [Row<"levelCandidate">];
    ctx.counts.retired++;
    await settleLevel(ctx, old.studyItemId, () => ctx.tx.update("levelCandidate", { id }, { retired: true }));
  },
};
