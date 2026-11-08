import { normalise } from "@mojibun/content-graph/grade";
import type { TokenDiff } from "../contract.ts";

export type SentenceToken = { surface: string; reading: string };
export type Diff = { tokens: TokenDiff[]; extra: string };

/** Dictation ignores all punctuation and spaces, as `grade()` does. */
export const strip = (text: string) => normalise(text).replace(/[\p{P}\p{S}\s]/gu, "");

const KATAKANA = /[ァ-ヶ]/u;
const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Hiragana and katakana count as the same only when the accepted form is in katakana. */
const matches = (typed: string, form: string) => typed === form || (KATAKANA.test(form) && toHiragana(typed) === toHiragana(form));

/** The ways one token can sit in the typed text: spelled, replaced by other text, or absent. */
type Step = { status: TokenDiff["status"]; next: number; typed?: string };

const stepsOf = (token: SentenceToken, input: string, at: number): Step[] => {
  const forms = [token.surface, token.reading].map(strip).filter((f) => f !== "");
  const spelled = forms.filter((f) => matches(input.slice(at, at + f.length), f));
  const correct = spelled.map((f): Step => ({ status: "correct", next: at + f.length }));
  const wrong = Array.from({ length: input.length - at }, (_, i): Step => ({ status: "wrong", next: at + i + 1, typed: input.slice(at, at + i + 1) }));
  return [...correct, ...wrong, { status: "missing", next: at }];
};

const COST = { correct: 0, wrong: 1, missing: 1 } as const;

type Best = { cost: number; steps: Step[] };

/**
 * Lines the typed text up with the Sentence's tokens, with the fewest wrong and missing tokens.
 * Ties go to `wrong` over `missing`, so a typo reads as a typo rather than as a gap plus extra text.
 */
export const diffDictation = (sentence: SentenceToken[], typed: string): Diff => {
  const input = strip(typed);
  const tokens = sentence.filter((t) => strip(t.surface) !== "" || strip(t.reading) !== "");

  // best[i].get(at): the cheapest way to place tokens[i..] given the typed text is consumed up to `at`.
  const best = Array.from({ length: tokens.length + 1 }, () => new Map<number, Best>());
  const solve = (i: number, at: number): Best => {
    const known = best[i]!.get(at);
    if (known) return known;
    if (i === tokens.length) return { cost: input.length > at ? 1 : 0, steps: [] };
    const options = stepsOf(tokens[i]!, input, at).map((step) => {
      const rest = solve(i + 1, step.next);
      return { cost: COST[step.status] + rest.cost, steps: [step, ...rest.steps] };
    });
    const chosen = options.reduce((a, b) => (b.cost < a.cost ? b : a));
    best[i]!.set(at, chosen);
    return chosen;
  };

  const { steps } = solve(0, 0);
  const consumed = steps.reduce((end, s) => Math.max(end, s.next), 0);
  return {
    tokens: tokens.map((t, i) => ({ surface: t.surface, reading: t.reading, status: steps[i]!.status, ...(steps[i]!.typed && { typed: steps[i]!.typed }) })),
    extra: input.slice(consumed),
  };
};
