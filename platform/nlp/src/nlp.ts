/** One morpheme of a Japanese text, as Sudachi splits it in mode C. */
export type Token = {
  readonly surface: string;
  /** Dictionary form: 食べ → 食べる. */
  readonly lemma: string;
  /** Reading in katakana, not pronunciation: 昨日 → キノウ. */
  readonly reading: string;
  /** Part of speech, coarsest first, unused levels left out: ["名詞", "普通名詞", "一般"]. */
  readonly partOfSpeech: readonly string[];
  /** Conjugation of an inflecting token, null for one that does not inflect. */
  readonly conjugation: Conjugation | null;
};

/** Sudachi's 活用型 and 活用形: type 下一段-バ行, form 連用形-一般. */
export type Conjugation = { readonly type: string; readonly form: string };

export interface Nlp {
  /** Splits a Japanese text into tokens, in order. Rejects when the tokeniser fails. */
  tokenize(text: string): Promise<Token[]>;
}
