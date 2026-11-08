import type { Row } from "../store.ts";
import { replaceLinks } from "./links.ts";
import { moveSpan } from "./match.ts";
import { same, type RunCtx } from "./run.ts";
import type { KanjiRecord, KanjiStrokesRecord, SentenceRecord, WordLevelRecord } from "./types.ts";

/** What KANJIDIC2 owns on a Kanji. `strokes` belong to KanjiVG: KANJIDIC2 starts them empty and never rewrites them. */
const kanjiFields = ({ key, strokes: _, ...fields }: KanjiRecord) => ({ literal: key, ...fields });

export const kanjidic = {
  add: async (ctx: RunCtx, record: KanjiRecord) => {
    const id = ctx.clock.newId();
    await ctx.tx.insert("studyItem", [{ id, type: "kanji", approval: "approved", retired: false, provenanceId: await ctx.provenance("edrdg") }]);
    await ctx.tx.insert("kanji", [{ studyItemId: id, ...kanjiFields(record), strokes: [], knownWrongMeanings: [] }]);
    await ctx.sourceKey(record.key, id);
    return id;
  },

  change: async (ctx: RunCtx, id: string, record: KanjiRecord) => {
    const [item] = await ctx.tx.rows("studyItem", { id });
    const [{ studyItemId: _, knownWrongMeanings: __, strokes: ___, ...old }] = (await ctx.tx.rows("kanji", { studyItemId: id })) as [Row<"kanji">];
    const next = kanjiFields(record);
    if (!item!.retired && same(old, next)) return false;
    await ctx.tx.update("studyItem", { id }, { retired: false, provenanceId: await ctx.provenance("edrdg") });
    await ctx.tx.update("kanji", { studyItemId: id }, next);
    await ctx.checkOverrides(id, next);
    return true;
  },

  retire: (ctx: RunCtx, id: string) => ctx.retireItem(id, null),
};

const literalOf = (codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16));

const kanjiOf = async (ctx: RunCtx, id: string) => ((await ctx.tx.rows("kanji", { studyItemId: id })) as [Row<"kanji">])[0];

/**
 * KanjiVG adds stroke data to Kanji KANJIDIC2 already made; it never creates one. A code point KANJIDIC2 lacks is skipped
 * (`add` returns null) and picked up by a later run once the Kanji exists. A character that leaves KanjiVG loses its
 * strokes; the Kanji itself stays, because KANJIDIC2 owns it.
 */
export const kanjivg = {
  add: async (ctx: RunCtx, record: KanjiStrokesRecord) => {
    const [kanji] = await ctx.tx.rows("kanji", { literal: literalOf(record.key) });
    if (!kanji) return null;
    await ctx.tx.update("kanji", { studyItemId: kanji.studyItemId }, { strokes: record.strokes });
    await ctx.sourceKey(record.key, kanji.studyItemId);
    return kanji.studyItemId;
  },

  change: async (ctx: RunCtx, id: string, record: KanjiStrokesRecord) => {
    const old = await kanjiOf(ctx, id);
    if (same(old.strokes, record.strokes)) return false;
    await ctx.tx.update("kanji", { studyItemId: id }, { strokes: record.strokes });
    await ctx.checkOverrides(id, { strokes: record.strokes });
    return true;
  },

  retire: async (ctx: RunCtx, id: string) => {
    ctx.counts.retired++;
    await ctx.tx.update("kanji", { studyItemId: id }, { strokes: [] });
  },
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

const YOMITAN_URL = "https://github.com/stephenmk/yomitan-jlpt-vocab";

/** Runs `write`, and counts the Study Item as level-changed when its current level differs afterwards. */
export const settleLevel = async (ctx: RunCtx, studyItemId: string, write: () => Promise<unknown>) => {
  const before = await ctx.currentLevel(studyItemId);
  await write();
  if (before !== (await ctx.currentLevel(studyItemId))) ctx.counts.levelsChanged++;
};

/**
 * yomitan-jlpt-vocab: each record is one List Level Candidate on the JMdict Word with that `ent_seq`. The source key
 * points at the candidate, so a refresh rewrites only this source's candidates and never an Editorial one.
 */
export const yomitan = {
  add: async (ctx: RunCtx, record: WordLevelRecord) => {
    const [jmdictKey] = await ctx.tx.rows("sourceKey", { dataset: "jmdict", upstreamKey: record.key });
    const [word] = jmdictKey ? await ctx.tx.rows("studyItem", { id: jmdictKey.recordId }) : [];
    if (!word || word.retired) {
      ctx.notes.push(`ent_seq ${record.key} is not in JMdict: skipped`);
      return null;
    }
    const id = ctx.clock.newId();
    const provenanceId = await ctx.provenance("cc-by-sa-4.0", "Jonathan Waller, via stephenmk", YOMITAN_URL);
    await settleLevel(ctx, word.id, () =>
      ctx.tx.insert("levelCandidate", [{ id, studyItemId: word.id, level: record.level, kind: "list", approval: "approved", retired: false, provenanceId }]),
    );
    await ctx.sourceKey(record.key, id);
    return id;
  },

  change: async (ctx: RunCtx, id: string, record: WordLevelRecord) => {
    const [old] = (await ctx.tx.rows("levelCandidate", { id })) as [Row<"levelCandidate">];
    if (!old.retired && old.level === record.level) return false;
    await settleLevel(ctx, old.studyItemId, async () =>
      ctx.tx.update("levelCandidate", { id }, { level: record.level, retired: false, provenanceId: await ctx.provenance("cc-by-sa-4.0", "Jonathan Waller, via stephenmk", YOMITAN_URL) }),
    );
    return true;
  },

  /** The list dropped the Word: its List candidate is Retired, and the Word keeps whatever level its other candidates give. */
  retire: async (ctx: RunCtx, id: string) => {
    const [old] = (await ctx.tx.rows("levelCandidate", { id })) as [Row<"levelCandidate">];
    ctx.counts.retired++;
    await settleLevel(ctx, old.studyItemId, () => ctx.tx.update("levelCandidate", { id }, { retired: true }));
  },
};
