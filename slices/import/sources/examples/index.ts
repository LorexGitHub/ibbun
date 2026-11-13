import { randomUUID } from "node:crypto";
import type { Authoring, Row } from "@mojibun/content-graph/authoring";
import { currentLevel } from "@mojibun/content-graph/levels";
import { sentenceUsesWord, toHiragana } from "../derived-links/derive.ts";
import { chunks } from "../derived-links/replace.ts";

/** Draft Examples a Study Item gets from Tatoeba, as a config value. */
export const EXAMPLES_PER_ITEM = 3;
/** Longer Sentences are hard to read at the first level; the shortest ones that use the item come first. */
const MAX_SENTENCE_LENGTH = 30;

const PROCESS = { name: "tatoeba-examples", version: "1" } as const;
const LEVEL = "N5";

export type ExamplesReport = { items: number; drafted: number; uncovered: number };

const provenanceFor = async (authoring: Authoring) => {
  const found = (await authoring.rows("provenance")).find(({ source }) => source.kind === "derived" && source.process === PROCESS.name && source.version === PROCESS.version);
  if (found) return found.id;
  const id = randomUUID();
  await authoring.insert("provenance", [{ id, source: { kind: "derived", process: PROCESS.name, version: PROCESS.version }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] }]);
  return id;
};

/** The reading of the Sentence's tokens inside a span, in hiragana. */
const readingOf = (sentence: Row<"sentence">, start: number, end: number) =>
  toHiragana(sentence.tokens.filter((t) => t.start >= start && t.end <= end).map((t) => t.reading).join(""));

const group = <T>(rows: T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const same = groups.get(key(row));
    if (same) same.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
};

/**
 * Draft Examples for every N5 Word and Kanji that has none, from the Tatoeba Sentences that use the Word (the Kanji's
 * Words, for a Kanji). The target is the Word's span and the one accepted answer is what the Sentence's own tokens
 * say. Everything lands as a Draft for Content Approval; an item with no usable Sentence stays Suspended. A rerun only
 * adds for items still without an Example, so it ends in the same state.
 */
export const deriveExamples = async ({ authoring }: { authoring: Authoring }): Promise<ExamplesReport> => {
  const [items, candidates, examples, sentences, forms, readings, contains] = await Promise.all([
    authoring.rows("studyItem", { approval: "approved", retired: false }),
    authoring.rows("levelCandidate"),
    authoring.rows("example", { retired: false }),
    authoring.rows("sentence", { retired: false }),
    authoring.rows("wordForm", { retired: false }),
    authoring.rows("wordReading", { retired: false }),
    authoring.rows("wordContainsKanji", { retired: false }),
  ]);
  const candidatesOf = group(candidates, (c) => c.studyItemId);
  const have = new Set(examples.filter((e) => e.approval !== "rejected").map((e) => e.studyItemId));
  const todo = items.filter((i) => (i.type === "word" || i.type === "kanji") && !have.has(i.id) && currentLevel(candidatesOf.get(i.id) ?? []) === LEVEL);

  const sentenceById = new Map(sentences.filter((s) => s.approval !== "rejected" && s.translationEn && s.text.length <= MAX_SENTENCE_LENGTH).map((s) => [s.id, s]));
  // Tatoeba Sentences are Drafts, which the derived-links rebuild skips, so match their tokens to Words here.
  const wordIds = new Set(items.filter((i) => i.type === "word").map((i) => i.id));
  const uses = sentenceUsesWord({ words: wordIds, retiredWords: new Set(), kanji: [], forms, readings, sentences: [...sentenceById.values()], coveredSentences: new Set(), clips: new Set(), examples: [] });
  const usesOf = group(uses, (u) => u.wordId);
  const wordsOf = group(contains, (c) => c.kanjiId);

  const provenanceId = await provenanceFor(authoring);
  const life = { approval: "draft", retired: false, provenanceId } as const;
  const newExamples: Row<"example">[] = [];
  const newAnswers: Row<"exampleAnswer">[] = [];
  let uncovered = 0;

  for (const item of todo) {
    const ofItem = item.type === "word" ? [item.id] : (wordsOf.get(item.id) ?? []).map((c) => c.wordId);
    const taken = new Set<string>();
    const found = ofItem
      .flatMap((id) => usesOf.get(id) ?? [])
      .flatMap((u) => {
        const sentence = sentenceById.get(u.sentenceId);
        return sentence && u.spanEnd > u.spanStart ? [{ sentence, start: u.spanStart, end: u.spanEnd }] : [];
      })
      .sort((a, b) => a.sentence.text.length - b.sentence.text.length)
      .filter(({ sentence }) => !taken.has(sentence.id) && taken.add(sentence.id))
      .slice(0, EXAMPLES_PER_ITEM);
    if (!found.length) uncovered++;
    for (const { sentence, start, end } of found) {
      const id = randomUUID();
      newExamples.push({ id, sentenceId: sentence.id, studyItemId: item.id, spanStart: start, spanEnd: end, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
      newAnswers.push({ id: randomUUID(), exampleId: id, kind: "accepted", written: sentence.text.slice(start, end), reading: readingOf(sentence, start, end) || null, message: null, ...life });
    }
  }
  for (const rows of chunks(newExamples)) await authoring.insert("example", rows);
  for (const rows of chunks(newAnswers)) await authoring.insert("exampleAnswer", rows);
  return { items: todo.length, drafted: newExamples.length, uncovered };
};

/**
 * The supervisor's bulk approval of the drafts `deriveExamples` made: each Example is decided with its Sentence, its
 * answer data and the Sentence's links as one unit (content-approval.md#units-of-approval), the Example last.
 */
export const approveDraftExamples = async ({ authoring }: { authoring: Authoring }): Promise<number> => {
  const ours = new Set((await authoring.rows("provenance")).filter(({ source }) => source.kind === "derived" && source.process === PROCESS.name).map((p) => p.id));
  const drafts = (await authoring.rows("example", { approval: "draft", retired: false })).filter((e) => ours.has(e.provenanceId));
  const decider = { kind: "supervisor" } as const;
  const decide = (recordTable: "sentence" | "exampleAnswer" | "sentenceUsesWord" | "example", recordId: string) =>
    authoring.decide({ recordTable, recordId, outcome: "approved", decider });
  const sentences = new Set<string>();
  for (const example of drafts) {
    if (!sentences.has(example.sentenceId)) {
      sentences.add(example.sentenceId);
      const [sentence] = await authoring.rows("sentence", { id: example.sentenceId });
      if (sentence?.approval !== "approved") await decide("sentence", sentence!.id);
      for (const link of await authoring.rows("sentenceUsesWord", { sentenceId: example.sentenceId, approval: "draft" })) await decide("sentenceUsesWord", link.id);
    }
    for (const answer of await authoring.rows("exampleAnswer", { exampleId: example.id, approval: "draft" })) await decide("exampleAnswer", answer.id);
    await decide("example", example.id);
  }
  return drafts.length;
};
