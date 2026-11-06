import type { Token } from "../../schema.ts";

/** One token the pattern requires. Every field given must match; part of speech matches as a prefix. */
export type MatcherToken = { lemma?: string; partOfSpeech?: string[]; conjugationForm?: string };

/** Skip up to `gap` tokens (zero included) before the next step. */
export type MatcherGap = { gap: number };

/** A Grammar Point's Matcher Rule: data, not code (docs/grammar-points.md#matcher-rule). */
export type MatcherRule = { pattern: [MatcherToken, ...(MatcherToken | MatcherGap)[]] };

/** Character offsets into the Sentence text. */
export type Span = { start: number; end: number };

const tokenMatches = (step: MatcherToken, token: Token): boolean =>
  (step.lemma === undefined || step.lemma === token.lemma) &&
  (step.conjugationForm === undefined || step.conjugationForm === token.conjugationForm) &&
  step.partOfSpeech?.every((part, i) => token.partOfSpeech[i] === part) !== false;

/** The token index after the shortest match of `pattern[p..]` from `i`, or -1. */
const matchFrom = (pattern: MatcherRule["pattern"], p: number, tokens: readonly Token[], i: number): number => {
  const step = pattern[p];
  if (step === undefined) return i;
  if ("gap" in step) return matchAfterGap(pattern, p, step.gap, tokens, i);
  const token = tokens[i];
  return token !== undefined && tokenMatches(step, token) ? matchFrom(pattern, p + 1, tokens, i + 1) : -1;
};

const matchAfterGap = (pattern: MatcherRule["pattern"], p: number, gap: number, tokens: readonly Token[], i: number): number => {
  for (let skip = 0; skip <= gap; skip++) {
    const end = matchFrom(pattern, p + 1, tokens, i + skip);
    if (end !== -1) return end;
  }
  return -1;
};

/** Every place the rule matches, one span per starting token, in text order. */
export const matchRule = (rule: MatcherRule, tokens: readonly Token[]): Span[] =>
  tokens.flatMap((first, i) => {
    const end = matchFrom(rule.pattern, 0, tokens, i);
    return end === -1 ? [] : [{ start: first.start, end: tokens[end - 1]!.end }];
  });
