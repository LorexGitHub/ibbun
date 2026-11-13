import { JLPT_LEVELS, type JlptLevel } from "@ibbun/shared";
import { matchRule, type MatcherRule, type Span } from "./matcher.ts";
import { fail, isContent, withinLevel, type CheckedSentence, type Failure, type Level } from "./types.ts";

/** Config values for the Sentence checks (docs/content-approval.md#automatic-checks). */
export type SentenceCheckConfig = {
  /** Check 8: the most characters a Sentence may have at each level. */
  lengthCaps: Record<JlptLevel, number>;
  /** Check 7: bigram similarity (0–1) at or above which two Sentences are near-duplicates. */
  nearDuplicate: number;
};

/** The Study Item an Example teaches, with the span the generator claims for it. */
export type ExampleTarget =
  | { type: "word"; wordId: string; level: JlptLevel; span: Span }
  | { type: "grammar_point"; rule: MatcherRule; level: JlptLevel; span: Span };

/** Check 2's outcome when the readings differ: shown to the reviewer, never a failure. */
export type ReadingDisagreement = { generator: string; sudachi: string };

/** Check 1: every content token links to a JMdict Word. */
export const checkWordLinks = (sentence: CheckedSentence): Failure[] =>
  sentence.tokens
    .filter((token) => isContent(token) && token.word === null)
    .map((token) => fail("word-link", `「${token.surface}」 (lemma ${token.lemma}) links to no JMdict Word. Use a dictionary word.`));

const toHiragana = (kana: string): string =>
  kana.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/** Check 2: the generator's kana reading against Sudachi's. Null when they agree. */
export const readingDisagreement = (sentence: CheckedSentence, generatorReading: string): ReadingDisagreement | null => {
  const sudachi = toHiragana(sentence.tokens.map((token) => token.reading).join(""));
  return toHiragana(generatorReading) === sudachi ? null : { generator: generatorReading, sudachi };
};

const linkedLevels = (sentence: CheckedSentence): Level[] => [
  ...sentence.tokens.flatMap((token) => (token.word ? [token.word.level] : [])),
  ...sentence.grammar.map((point) => point.level),
];

/** The highest current level among linked Words and Grammar Points; Unlevelled ones are ignored. */
export const computedLevel = (sentences: readonly CheckedSentence[]): JlptLevel | undefined => {
  const levels = sentences.flatMap(linkedLevels);
  return JLPT_LEVELS.findLast((level) => levels.includes(level));
};

/** Check 3: the computed level is at or below the target's level. */
export const checkLevel = (sentences: readonly CheckedSentence[], cap: JlptLevel): Failure[] => {
  const level = computedLevel(sentences);
  return level === undefined || withinLevel(level, cap)
    ? []
    : [fail("level", `The text is ${level}, above ${cap}. Replace the harder words or grammar.`)];
};

/** Check 4: no Unlevelled Words, except one at N1. */
export const checkUnlevelled = (sentence: CheckedSentence, cap: JlptLevel): Failure[] => {
  const ids = new Set(sentence.tokens.flatMap((token) => (token.word && token.word.level === null ? [token.word.id] : [])));
  const allowed = cap === "N1" ? 1 : 0;
  return ids.size > allowed
    ? [fail("unlevelled", `${ids.size} Word(s) have no JLPT level; at most ${allowed} allowed. Use words from the JLPT lists.`)]
    : [];
};

const targetSpans = (sentence: CheckedSentence, target: ExampleTarget): Span[] =>
  target.type === "word"
    ? sentence.tokens.filter((token) => token.word?.id === target.wordId).map(({ start, end }) => ({ start, end }))
    : matchRule(target.rule, sentence.tokens);

/** Check 5: the target appears exactly once, and the claimed span is that occurrence. */
export const checkTarget = (sentence: CheckedSentence, target: ExampleTarget): Failure[] => {
  const spans = targetSpans(sentence, target);
  if (spans.length !== 1) return [fail("target", `The target appears ${spans.length} times; it must appear exactly once.`)];
  const [found] = spans as [Span];
  return found.start === target.span.start && found.end === target.span.end
    ? []
    : [fail("target", `The target span ${target.span.start}–${target.span.end} does not match where it appears (${found.start}–${found.end}).`)];
};

/** Check 6: an English translation is present. */
export const checkTranslation = (sentence: CheckedSentence): Failure[] =>
  sentence.translationEn?.trim() ? [] : [fail("translation", "The English translation is missing.")];

const normalise = (text: string): string => text.replace(/[\s\p{P}\p{S}]/gu, "");

const bigrams = (text: string): string[] => [...text].slice(1).map((ch, i) => [...text][i] + ch);

/** Dice similarity over character bigrams, after dropping spaces and punctuation. */
export const similarity = (a: string, b: string): number => {
  const [x, y] = [bigrams(normalise(a)), bigrams(normalise(b))];
  if (x.length + y.length === 0) return normalise(a) === normalise(b) ? 1 : 0;
  const pool = [...y];
  const shared = x.filter((gram) => {
    const at = pool.indexOf(gram);
    if (at === -1) return false;
    pool.splice(at, 1);
    return true;
  }).length;
  return (2 * shared) / (x.length + y.length);
};

/** Check 7: not a duplicate or near-duplicate of an existing Sentence. */
export const checkDuplicate = (sentence: CheckedSentence, existing: readonly string[], threshold: number): Failure[] =>
  existing
    .filter((text) => similarity(sentence.text, text) >= threshold)
    .map((text) => fail("duplicate", `Too close to the existing Sentence 「${text}」. Write a different one.`));

/** Check 8: within the length cap for its level. */
export const checkLength = (sentence: CheckedSentence, cap: JlptLevel, caps: Record<JlptLevel, number>): Failure[] => {
  const length = [...sentence.text].length;
  return length > caps[cap] ? [fail("length", `${length} characters; the ${cap} cap is ${caps[cap]}. Shorten it.`)] : [];
};

/** Checks 1, 2 and 6–8: the ones a Sentence gets wherever it appears. */
const sentenceBasics = (sentence: CheckedSentence, level: JlptLevel, existing: readonly string[], config: SentenceCheckConfig) => [
  ...checkWordLinks(sentence),
  ...checkTranslation(sentence),
  ...checkDuplicate(sentence, existing, config.nearDuplicate),
  ...checkLength(sentence, level, config.lengthCaps),
];

export type SentenceDraft = { sentence: CheckedSentence; generatorReading: string };

const disagreements = (drafts: readonly SentenceDraft[]): ReadingDisagreement[] =>
  drafts.flatMap((draft) => {
    const found = readingDisagreement(draft.sentence, draft.generatorReading);
    return found ? [found] : [];
  });

export type CheckReport = { failures: Failure[]; readingDisagreements: ReadingDisagreement[] };

/** Sentence checks 1–8 for a generated Example. */
export const checkExampleSentence = (
  draft: SentenceDraft,
  target: ExampleTarget,
  existing: readonly string[],
  config: SentenceCheckConfig,
): CheckReport => {
  const { sentence } = draft;
  return {
    failures: [
      ...sentenceBasics(sentence, target.level, existing, config),
      ...checkLevel([sentence], target.level),
      ...checkUnlevelled(sentence, target.level),
      ...checkTarget(sentence, target),
    ],
    readingDisagreements: disagreements([draft]),
  };
};

/** What a Reading Passage (or dialogue) must contain: Words by ID, Grammar Points by Matcher Rule. */
export type PassageTarget = { type: "word"; wordId: string } | { type: "grammar_point"; rule: MatcherRule };

const appears = (sentences: readonly CheckedSentence[], target: PassageTarget): boolean =>
  sentences.some((sentence) =>
    target.type === "word"
      ? sentence.tokens.some((token) => token.word?.id === target.wordId)
      : matchRule(target.rule, sentence.tokens).length > 0,
  );

/** Every target appears somewhere in the passage. */
export const checkTargetsAppear = (sentences: readonly CheckedSentence[], targets: readonly PassageTarget[]): Failure[] =>
  targets
    .filter((target) => !appears(sentences, target))
    .map((target) => fail("target", `The target ${target.type === "word" ? target.wordId : "grammar point"} does not appear.`));

/**
 * Reading Passage checks: 1, 2 and 6–8 per Sentence, every target appears, and the
 * passage's computed level is at or below the requested level. Dialogues use these too.
 */
export const checkReadingPassage = (
  drafts: readonly SentenceDraft[],
  targets: readonly PassageTarget[],
  level: JlptLevel,
  existing: readonly string[],
  config: SentenceCheckConfig,
): CheckReport => {
  const sentences = drafts.map((draft) => draft.sentence);
  return {
    failures: [
      ...sentences.flatMap((sentence) => sentenceBasics(sentence, level, existing, config)),
      ...checkTargetsAppear(sentences, targets),
      ...checkLevel(sentences, level),
    ],
    readingDisagreements: disagreements(drafts),
  };
};
