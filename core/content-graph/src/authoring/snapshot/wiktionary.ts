import type { Row } from "../store.ts";
import type { RunCtx } from "./run.ts";
import type { WiktionaryRecord } from "./types.ts";

const pageUrl = (title: string) => `https://ja.wiktionary.org/wiki/${encodeURIComponent(title)}`;

/** CC BY-SA 4.0 and a link to the entry's page on every gloss (docs/licensing.md#approved-licences). */
const credit = (ctx: RunCtx, record: WiktionaryRecord) => ctx.provenance("cc-by-sa-4.0", null, pageUrl(record.title));

/** The JLPT Words of the graph by headword: the kanji spellings, or the readings of a Word with no kanji form. */
type WordsByTitle = Map<string, string[]>;

const index = async (ctx: RunCtx): Promise<WordsByTitle> => {
  const levelled = new Set((await ctx.tx.rows("levelCandidate", { retired: false })).map((c) => c.studyItemId));
  const forms = (await ctx.tx.rows("wordForm", { retired: false })).filter((f) => levelled.has(f.wordId));
  const withForms = new Set(forms.map((f) => f.wordId));
  const readings = (await ctx.tx.rows("wordReading", { retired: false })).filter((r) => levelled.has(r.wordId) && !withForms.has(r.wordId));
  const words: WordsByTitle = new Map();
  for (const { text, wordId } of [...forms, ...readings]) words.set(text, [...new Set([...(words.get(text) ?? []), wordId])]);
  return words;
};

const indexes = new WeakMap<RunCtx, Promise<WordsByTitle>>();
const wordsOf = async (ctx: RunCtx, title: string) => {
  if (!indexes.has(ctx)) indexes.set(ctx, index(ctx));
  return (await indexes.get(ctx)!).get(title) ?? [];
};

/**
 * The Word's first sense takes the gloss provisionally; a sense-alignment proposal, approved in Content Approval, moves it
 * (research/japanese-explanation-sources.md#sense-alignment). A page that could be several Words is left alone, since the
 * dump does not say which spelling a gloss describes.
 */
const home = async (ctx: RunCtx, title: string) => {
  const words = await wordsOf(ctx, title);
  if (words.length !== 1) return null;
  const [sense] = (await ctx.tx.rows("wordSense", { wordId: words[0]!, retired: false })).sort((a, b) => a.position - b.position);
  return sense ? { sense, wordId: words[0]! } : null;
};

export const wiktionary = {
  add: async (ctx: RunCtx, record: WiktionaryRecord) => {
    const target = await home(ctx, record.title);
    if (!target) return null;
    const id = ctx.clock.newId();
    await ctx.tx.insert("japaneseExplanation", [
      { id, wordSenseId: target.sense.id, grammarPointId: null, text: record.text, approval: "draft", retired: false, provenanceId: await credit(ctx, record) },
    ]);
    await ctx.sourceKey(record.key, id);
    await ctx.r.requestGeneration({ targetId: target.wordId, kind: "sense_alignment", reason: "ja Wiktionary glosses imported" });
    return id;
  },

  /** A changed gloss goes back to Draft, so what a reviewer approved is never silently rewritten. */
  change: async (ctx: RunCtx, id: string, record: WiktionaryRecord) => {
    const [old] = (await ctx.tx.rows("japaneseExplanation", { id })) as [Row<"japaneseExplanation">];
    if (!old.retired && old.text === record.text) return false;
    await ctx.tx.update("japaneseExplanation", { id }, { text: record.text, approval: "draft", retired: false, provenanceId: await credit(ctx, record) });
    await ctx.checkOverrides(id, { text: record.text });
    return true;
  },

  /** A gloss that left the page is Retired. */
  retire: async (ctx: RunCtx, id: string) => {
    ctx.counts.retired++;
    await ctx.tx.update("japaneseExplanation", { id }, { retired: true });
    await ctx.orphanOverrides(id);
  },
};
