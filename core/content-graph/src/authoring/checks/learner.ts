import { matchRule, type MatcherRule } from "./matcher.ts";
import { fail, isUncounted, withinLevel, type CheckedSentence, type Failure, type Level } from "./types.ts";

/** A Study Item a Learner-aware text is asked to use (docs/batch-text.md#automatic-checks). */
export type TextItem =
  | { type: "word"; id: string; lemma: string }
  | { type: "grammar_point"; id: string; rule: MatcherRule }
  | { type: "kanji"; id: string; literal: string };

/** Inclusive character bounds for the whole text. */
export type LengthRange = { min: number; max: number };

/** The Study Item IDs the Learner Knows (any source, `manual` included). */
export type KnownSet = ReadonlySet<string>;

const reachable = (id: string, level: Level, cap: Level, known: KnownSet): boolean =>
  known.has(id) || (level !== null && (cap === null || withinLevel(level, cap)));

/** Words a Kanji may appear inside: batch Words and Words within reach. */
const allowedWordTokens = (sentences: readonly CheckedSentence[], batch: readonly TextItem[], cap: Level, known: KnownSet) => {
  const batchWords = new Set(batch.filter((item) => item.type === "word").map((item) => item.id));
  return sentences.flatMap((s) => s.tokens).filter((t) => t.word && (batchWords.has(t.word.id) || reachable(t.word.id, t.word.level, cap, known)));
};

const appears = (item: TextItem, sentences: readonly CheckedSentence[], kanjiHosts: readonly { surface: string }[]): boolean => {
  if (item.type === "kanji") return kanjiHosts.some((token) => token.surface.includes(item.literal));
  if (item.type === "word") return sentences.some((s) => s.tokens.some((token) => token.lemma === item.lemma));
  return sentences.some((s) => matchRule(item.rule, s.tokens).length > 0);
};

const itemsThatAppear = (items: readonly TextItem[], sentences: readonly CheckedSentence[], cap: Level, known: KnownSet, batch: readonly TextItem[]) => {
  const hosts = allowedWordTokens(sentences, batch, cap, known);
  return items.filter((item) => appears(item, sentences, hosts));
};

/** Every batch item appears, except those the Learner already Knows. */
export const checkBatchItemsAppear = (sentences: readonly CheckedSentence[], batch: readonly TextItem[], cap: Level, known: KnownSet): Failure[] => {
  const required = batch.filter((item) => !known.has(item.id));
  const found = new Set(itemsThatAppear(required, sentences, cap, known, batch));
  return required
    .filter((item) => !found.has(item))
    .map((item) => fail("batch-item", `The batch ${item.type.replace("_", " ")} ${label(item)} does not appear. Use it.`));
};

const label = (item: TextItem): string =>
  item.type === "word" ? `「${item.lemma}」` : item.type === "kanji" ? `「${item.literal}」` : item.id;

/**
 * Every other Word and Grammar Point is Known, or levelled at or below `cap`
 * (any level when `cap` is null, for an Unlevelled batch). Proper nouns and numbers don't count.
 */
export const checkWithinReach = (sentences: readonly CheckedSentence[], exempt: readonly TextItem[], cap: Level, known: KnownSet): Failure[] => {
  const skip = new Set(exempt.map((item) => item.id));
  const words = sentences.flatMap((s) => s.tokens.filter((t) => !isUncounted(t)).flatMap((t) => (t.word ? [{ ...t.word, name: t.surface }] : [])));
  const grammar = sentences.flatMap((s) => s.grammar.map((g) => ({ ...g, name: g.id })));
  const outOfReach = [...words, ...grammar].filter((item) => !skip.has(item.id) && !reachable(item.id, item.level, cap, known));
  return [...new Map(outOfReach.map((item) => [item.id, item])).values()].map((item) =>
    fail("out-of-reach", `「${item.name}」 is ${levelName(item.level)} and not Known to the Learner. Replace it.`),
  );
};

const levelName = (level: Level): string => (level === null ? "Unlevelled" : level);

/** At least half of the given items appear (earlier items for Batch Texts, weakest Known items for Practice Texts). */
export const checkHalfUsed = (sentences: readonly CheckedSentence[], given: readonly TextItem[], cap: Level, known: KnownSet): Failure[] => {
  const used = itemsThatAppear(given, sentences, cap, known, []).length;
  return used * 2 >= given.length
    ? []
    : [fail("reuse", `Only ${used} of the ${given.length} given items appear; use at least half.`)];
};

/** The whole text is within its target length range. */
export const checkTextLength = (sentences: readonly CheckedSentence[], range: LengthRange): Failure[] => {
  const length = sentences.reduce((sum, s) => sum + [...s.text].length, 0);
  return length >= range.min && length <= range.max
    ? []
    : [fail("length", `${length} characters; aim for ${range.min}–${range.max}.`)];
};

export type BatchTextInput = {
  sentences: readonly CheckedSentence[];
  /** The batch's JLPT Level, or null for an Unlevelled batch. */
  level: Level;
  batch: readonly TextItem[];
  earlier: readonly TextItem[];
  known: KnownSet;
  length: LengthRange;
};

/** Batch Text checks, in place of Sentence checks 3 and 4. */
export const checkBatchText = (input: BatchTextInput): Failure[] => [
  ...checkBatchItemsAppear(input.sentences, input.batch, input.level, input.known),
  ...checkWithinReach(input.sentences, input.batch, input.level, input.known),
  ...checkHalfUsed(input.sentences, input.earlier, input.level, input.known),
  ...checkTextLength(input.sentences, input.length),
];

export type PracticeTextInput = {
  sentences: readonly CheckedSentence[];
  level: Level;
  /** The Learner's weakest Known items of the level that the generator was given. */
  weakest: readonly TextItem[];
  known: KnownSet;
  length: LengthRange;
};

/** Practice Text checks (docs/listening.md#content-rules): within reach, half the weakest items, length. */
export const checkPracticeText = (input: PracticeTextInput): Failure[] => [
  ...checkWithinReach(input.sentences, [], input.level, input.known),
  ...checkHalfUsed(input.sentences, input.weakest, input.level, input.known),
  ...checkTextLength(input.sentences, input.length),
];
