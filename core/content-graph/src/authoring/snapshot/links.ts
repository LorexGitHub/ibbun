import type { Row } from "../store.ts";
import type { RunCtx } from "./run.ts";
import type { SentenceLink, SentenceRecord } from "./types.ts";

type Index = {
  byEntry: Map<string, string>;
  /** Live Words by headword form, or by reading for a Word with no kanji form. */
  byText: Map<string, string[]>;
  common: Set<string>;
  forms: Map<string, Row<"wordForm">[]>;
  readings: Map<string, Row<"wordReading">[]>;
  senses: Map<string, Row<"wordSense">[]>;
};

const group = <T extends { wordId: string }>(rows: T[]) => {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.wordId, [...(map.get(r.wordId) ?? []), r]);
  return map;
};

const push = (map: Map<string, string[]>, key: string, id: string) => map.set(key, [...(map.get(key) ?? []), id]);

const load = async ({ tx }: RunCtx): Promise<Index> => {
  const live = new Set((await tx.rows("studyItem", { type: "word", retired: false })).map((i) => i.id));
  const forms = group((await tx.rows("wordForm", { retired: false })).filter((f) => live.has(f.wordId)));
  const readings = group((await tx.rows("wordReading", { retired: false })).filter((r) => live.has(r.wordId)));
  const byText = new Map<string, string[]>();
  for (const [wordId, fs] of forms) for (const f of fs) push(byText, f.text, wordId);
  for (const [wordId, rs] of readings) if (!forms.has(wordId)) for (const r of rs) push(byText, r.text, wordId);
  const senses = group((await tx.rows("wordSense", { retired: false })).filter((s) => live.has(s.wordId)));
  for (const list of senses.values()) list.sort((a, b) => a.position - b.position);
  return {
    byEntry: new Map((await tx.rows("sourceKey", { dataset: "jmdict" })).filter((k) => live.has(k.recordId)).map((k) => [k.upstreamKey, k.recordId])),
    byText,
    common: new Set((await tx.rows("word")).filter((w) => w.priorityTags.includes("common")).map((w) => w.studyItemId)),
    forms,
    readings,
    senses,
  };
};

const indexes = new WeakMap<RunCtx, Promise<Index>>();
const indexOf = (ctx: RunCtx) => indexes.get(ctx) ?? indexes.set(ctx, load(ctx)).get(ctx)!;

/** The one live Word a link names, or null when it names none or cannot tell between several. */
const wordOf = (index: Index, link: SentenceLink): string | null => {
  const byEntry = link.entry === null ? undefined : index.byEntry.get(link.entry);
  if (byEntry) return byEntry;
  let candidates = [...new Set(index.byText.get(link.form) ?? [])];
  const heard = candidates.filter((id) => index.readings.get(id)?.some((r) => r.text === link.reading));
  if (heard.length) candidates = heard;
  if (candidates.length > 1) candidates = candidates.filter((id) => index.common.has(id));
  return candidates.length === 1 ? candidates[0]! : null;
};

type Resolved = Pick<Row<"sentenceUsesWord">, "wordId" | "formId" | "readingId" | "senseId" | "spanStart" | "spanEnd">;

const resolve = (index: Index, link: SentenceLink): Resolved | null => {
  const wordId = wordOf(index, link);
  if (wordId === null) return null;
  return {
    wordId,
    formId: index.forms.get(wordId)?.find((f) => f.text === link.form)?.id ?? null,
    readingId: index.readings.get(wordId)?.find((r) => r.text === link.reading)?.id ?? null,
    senseId: (link.sense === null ? undefined : index.senses.get(wordId)?.[link.sense - 1])?.id ?? null,
    spanStart: link.start,
    spanEnd: link.end,
  };
};

const fingerprint = (rows: Resolved[]) =>
  rows
    .map((r) => JSON.stringify([r.wordId, r.formId, r.readingId, r.senseId, r.spanStart, r.spanEnd]))
    .sort()
    .join();

/**
 * Makes the Sentence's Sentence-uses-Word links those of the record. Derived links are a cache, so a changed set
 * replaces the old one outright (docs/adr/0004); an unchanged set is left alone.
 */
export const replaceLinks = async (ctx: RunCtx, sentenceId: string, record: SentenceRecord) => {
  const index = await indexOf(ctx);
  const wanted = (record.links ?? []).map((l) => resolve(index, l)).filter((r): r is Resolved => r !== null);
  const have = await ctx.tx.rows("sentenceUsesWord", { sentenceId });
  if (fingerprint(wanted) === fingerprint(have)) return;
  await ctx.tx.remove("sentenceUsesWord", { sentenceId });
  const provenanceId = await ctx.derivedProvenance(record.licence, [sentenceId]);
  await ctx.tx.insert(
    "sentenceUsesWord",
    wanted.map((r) => ({ id: ctx.clock.newId(), sentenceId, ...r, approval: "draft" as const, retired: false, provenanceId })),
  );
};
