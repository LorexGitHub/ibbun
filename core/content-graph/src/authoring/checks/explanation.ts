import type { Token } from "../../schema.ts";
import { matchRule, type MatcherRule } from "./matcher.ts";
import { fail, type Failure, type Level } from "./types.ts";

/** What the checks know about one Kanji: its current level and whether it is jōyō. */
export type KanjiFacts = { level: Level; joyo: boolean };

const KANJI = /\p{Script=Han}/u;

/** Japanese Explanation checks: no Latin script, no headword, every Kanji levelled or jōyō. */
export const checkJapaneseExplanation = (
  text: string,
  headwords: readonly string[],
  kanji: ReadonlyMap<string, KanjiFacts>,
): Failure[] => [
  ...(/[A-Za-zＡ-Ｚａ-ｚ]/.test(text) ? [fail("latin", "Write the explanation in Japanese only, with no Latin letters.")] : []),
  ...headwords.filter((word) => text.includes(word)).map((word) => fail("headword", `Do not use the headword 「${word}」 itself.`)),
  ...[...new Set([...text].filter((ch) => KANJI.test(ch)))]
    .filter((ch) => kanji.get(ch)?.level == null && !kanji.get(ch)?.joyo)
    .map((ch) => fail("kanji", `「${ch}」 is neither levelled nor jōyō. Use kana or a common Kanji.`)),
];

/** Matcher Rule check: the rule matches every one of its Grammar Point's own example Sentences. */
export const checkMatcherRule = (rule: MatcherRule, examples: readonly { text: string; tokens: readonly Token[] }[]): Failure[] =>
  examples
    .filter((example) => matchRule(rule, example.tokens).length === 0)
    .map((example) => fail("matcher-rule", `The rule does not match the example 「${example.text}」.`));
