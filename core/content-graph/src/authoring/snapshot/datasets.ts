import type { Row } from "../store.ts";
import { replaceLinks } from "./links.ts";
import { moveSpan } from "./match.ts";
import { same, type RunCtx } from "./run.ts";
import type { KanjiRecord, SentenceRecord } from "./types.ts";

const kanjiFields = ({ key, ...fields }: KanjiRecord) => ({ literal: key, ...fields });

export const kanjidic = {
  add: async (ctx: RunCtx, record: KanjiRecord) => {
    const id = ctx.clock.newId();
    await ctx.tx.insert("studyItem", [{ id, type: "kanji", approval: "approved", retired: false, provenanceId: await ctx.provenance("edrdg") }]);
    await ctx.tx.insert("kanji", [{ studyItemId: id, ...kanjiFields(record), knownWrongMeanings: [] }]);
    await ctx.sourceKey(record.key, id);
    return id;
  },

  change: async (ctx: RunCtx, id: string, record: KanjiRecord) => {
    const [item] = await ctx.tx.rows("studyItem", { id });
    const [{ studyItemId: _, knownWrongMeanings: __, ...old }] = (await ctx.tx.rows("kanji", { studyItemId: id })) as [Row<"kanji">];
    const next = kanjiFields(record);
    if (!item!.retired && same(old, next)) return false;
    await ctx.tx.update("studyItem", { id }, { retired: false, provenanceId: await ctx.provenance("edrdg") });
    await ctx.tx.update("kanji", { studyItemId: id }, next);
    await ctx.checkOverrides(id, next);
    return true;
  },

  retire: (ctx: RunCtx, id: string) => ctx.retireItem(id, null),
};

const credit = (ctx: RunCtx, record: SentenceRecord) =>
  ctx.provenance(record.licence, record.author, `https://tatoeba.org/sentences/show/${record.key}`);

/** Each Example on a Sentence whose text changed keeps its span when its target still appears exactly once; else it goes back to Draft. */
const moveExamples = async (ctx: RunCtx, oldText: string, record: SentenceRecord, examples: Row<"example">[]) => {
  for (const e of examples) {
    const span = moveSpan(oldText.slice(e.spanStart, e.spanEnd), record.text);
    if (span) await ctx.tx.update("example", { id: e.id }, span);
    else await ctx.redraft(e, "example redrafted");
  }
};

export const tatoeba = {
  add: async (ctx: RunCtx, record: SentenceRecord) => {
    const id = ctx.clock.newId();
    const { text, translationEn, tokens } = record;
    const provenanceId = await credit(ctx, record);
    await ctx.tx.insert("sentence", [
      { id, text, translationEn, tokens, audioKey: null, audioVoice: null, unlevelledWordCount: 0, approval: "draft", retired: false, provenanceId },
    ]);
    await ctx.sourceKey(record.key, id);
    await replaceLinks(ctx, id, record);
    return id;
  },

  change: async (ctx: RunCtx, id: string, record: SentenceRecord) => {
    await replaceLinks(ctx, id, record);
    const [old] = (await ctx.tx.rows("sentence", { id })) as [Row<"sentence">];
    const [provenance] = await ctx.tx.rows("provenance", { id: old.provenanceId });
    const { text, translationEn, tokens } = record;
    const credited = provenance?.author === record.author && provenance.licence === record.licence;
    if (!old.retired && credited && same({ text: old.text, translationEn: old.translationEn, tokens: old.tokens }, { text, translationEn, tokens })) return false;
    await ctx.tx.update("sentence", { id }, { text, translationEn, tokens, retired: false, provenanceId: await credit(ctx, record) });
    await ctx.checkOverrides(id, { text, translationEn });
    const examples = await ctx.tx.rows("example", { sentenceId: id, retired: false });
    if (old.translationEn !== translationEn) for (const e of examples) await ctx.redraft(e, "example redrafted");
    else if (old.text !== text) await moveExamples(ctx, old.text, record, examples);
    return true;
  },

  /** A deleted Sentence is Retired, and its Examples with it. */
  retire: async (ctx: RunCtx, id: string) => {
    ctx.counts.retired++;
    await ctx.tx.update("sentence", { id }, { retired: true });
    await ctx.orphanOverrides(id);
    for (const e of await ctx.tx.rows("example", { sentenceId: id, retired: false })) {
      await ctx.touch(e.studyItemId);
      await ctx.tx.update("example", { id: e.id }, { retired: true });
    }
  },
};
