import { describe, expect, it } from "vitest";
import {
  checkBatchText,
  checkExampleSentence,
  checkJapaneseExplanation,
  checkMatcherRule,
  checkPracticeText,
  checkReadingPassage,
  computedLevel,
  matchRule,
  similarity,
  type CheckedSentence,
  type ExampleTarget,
  type KanjiFacts,
  type Level,
  type LinkedToken,
  type MatcherRule,
  type SentenceCheckConfig,
  type TextItem,
} from "../index.ts";

type Spec = [surface: string, lemma: string, pos: string, word?: [id: string, level: Level] | null, form?: string, reading?: string];

/** Tokens laid end to end, so spans follow from the surfaces. */
const tokens = (...specs: Spec[]): LinkedToken[] => {
  let at = 0;
  return specs.map(([surface, lemma, pos, word = null, form, reading]) => {
    const start = at;
    at += surface.length;
    return {
      surface,
      reading: reading ?? surface,
      lemma,
      partOfSpeech: pos.split(","),
      conjugationForm: form ?? null,
      start,
      end: at,
      word: word ? { id: word[0], level: word[1] } : null,
    };
  });
};

const sentence = (toks: LinkedToken[], extra: Partial<CheckedSentence> = {}): CheckedSentence => ({
  text: toks.map((t) => t.surface).join(""),
  translationEn: "A translation.",
  tokens: toks,
  grammar: [],
  ...extra,
});

// 私は猫が好きです。
const cat = (): LinkedToken[] =>
  tokens(
    ["私", "私", "代名詞", ["w-watashi", "N5"], undefined, "わたし"],
    ["は", "は", "助詞,係助詞"],
    ["猫", "猫", "名詞,普通名詞", ["w-neko", "N5"], undefined, "ねこ"],
    ["が", "が", "助詞,格助詞"],
    ["好き", "好き", "形状詞,一般", ["w-suki", "N5"], undefined, "すき"],
    ["です", "です", "助動詞", null, "終止形-一般"],
    ["。", "。", "補助記号,句点"],
  );

const config: SentenceCheckConfig = {
  lengthCaps: { N5: 12, N4: 20, N3: 30, N2: 40, N1: 50 },
  nearDuplicate: 0.8,
};

const nekoTarget: ExampleTarget = { type: "word", wordId: "w-neko", level: "N5", span: { start: 2, end: 3 } };
const checks = (report: { failures: { check: string }[] }) => report.failures.map((f) => f.check);

describe("matchRule", () => {
  const verbTe: MatcherRule = {
    pattern: [{ partOfSpeech: ["動詞"], conjugationForm: "連用形-一般" }, { lemma: "て" }, { gap: 1 }, { lemma: "いる" }],
  };
  const eating = tokens(
    ["食べ", "食べる", "動詞,一般", null, "連用形-一般"],
    ["て", "て", "助詞,接続助詞"],
    ["い", "いる", "動詞,非自立可能", null, "連用形-一般"],
    ["ます", "ます", "助動詞"],
  );

  it("matches a token sequence over lemma, part of speech and conjugation form and returns its span", () => {
    expect(matchRule(verbTe, eating)).toEqual([{ start: 0, end: 4 }]);
  });

  it("skips up to the gap's length of tokens", () => {
    const withGap = tokens(
      ["食べ", "食べる", "動詞,一般", null, "連用形-一般"],
      ["て", "て", "助詞,接続助詞"],
      ["は", "は", "助詞,係助詞"],
      ["い", "いる", "動詞,非自立可能"],
    );
    expect(matchRule(verbTe, withGap)).toEqual([{ start: 0, end: 5 }]);
    const tooFar = tokens(
      ["食べ", "食べる", "動詞,一般", null, "連用形-一般"],
      ["て", "て", "助詞"],
      ["は", "は", "助詞"],
      ["も", "も", "助詞"],
      ["い", "いる", "動詞"],
    );
    expect(matchRule(verbTe, tooFar)).toEqual([]);
  });

  it("fails on a different conjugation form, lemma or part of speech", () => {
    const wrongForm = tokens(["食べる", "食べる", "動詞,一般", null, "終止形-一般"], ["て", "て", "助詞"], ["いる", "いる", "動詞"]);
    expect(matchRule(verbTe, wrongForm)).toEqual([]);
    expect(matchRule({ pattern: [{ lemma: "て" }] }, tokens(["で", "で", "助詞"]))).toEqual([]);
    expect(matchRule({ pattern: [{ partOfSpeech: ["動詞", "一般"] }] }, tokens(["い", "いる", "動詞,非自立可能"]))).toEqual([]);
  });

  it("returns every match and stops at the end of the tokens", () => {
    const rule: MatcherRule = { pattern: [{ lemma: "は" }, { gap: 2 }, { lemma: "が" }] };
    const toks = tokens(["は", "は", "助詞"], ["が", "が", "助詞"], ["は", "は", "助詞"]);
    expect(matchRule(rule, toks)).toEqual([{ start: 0, end: 2 }]);
  });
});

describe("Sentence checks 1–8 for an Example", () => {
  const draft = (s: CheckedSentence, reading = "わたしはねこがすきです。") => ({ sentence: s, generatorReading: reading });

  it("passes a clean N5 Example", () => {
    expect(checkExampleSentence(draft(sentence(cat())), nekoTarget, [], config)).toEqual({ failures: [], readingDisagreements: [] });
  });

  it("1: fails each content token with no JMdict Word, but not particles, proper nouns or numbers", () => {
    const toks = tokens(
      ["田中", "田中", "名詞,固有名詞", null],
      ["三", "三", "名詞,数詞", null],
      ["猫", "猫", "名詞,普通名詞", ["w-neko", "N5"]],
      ["ぴょ", "ぴょ", "感動詞", null],
      ["。", "。", "補助記号"],
    );
    const report = checkExampleSentence(draft(sentence(toks), "たなかさんねこぴょ。"), { ...nekoTarget, span: { start: 3, end: 4 } }, [], config);
    expect(report.failures).toEqual([{ check: "word-link", message: "「ぴょ」 (lemma ぴょ) links to no JMdict Word. Use a dictionary word." }]);
  });

  it("2: reports a reading disagreement without failing, ignoring katakana versus hiragana", () => {
    const s = sentence(cat());
    expect(checkExampleSentence(draft(s, "ワタシハネコガスキデス。"), nekoTarget, [], config).readingDisagreements).toEqual([]);
    const report = checkExampleSentence(draft(s, "わたくしはねこがすきです。"), nekoTarget, [], config);
    expect(report).toEqual({
      failures: [],
      readingDisagreements: [{ generator: "わたくしはねこがすきです。", sudachi: "わたしはねこがすきです。" }],
    });
  });

  it("3: fails when a linked Word or Grammar Point is above the target's level; Unlevelled ones are ignored", () => {
    const toks = cat();
    toks[4]!.word = { id: "w-suki", level: "N4" };
    expect(checks(checkExampleSentence(draft(sentence(toks)), nekoTarget, [], config))).toEqual(["level"]);
    const viaGrammar = sentence(cat(), { grammar: [{ id: "g-1", level: "N3" }] });
    expect(checkExampleSentence(draft(viaGrammar), { ...nekoTarget, level: "N4" }, [], config).failures).toEqual([
      { check: "level", message: "The text is N3, above N4. Replace the harder words or grammar." },
    ]);
    expect(computedLevel([sentence(cat(), { grammar: [{ id: "g-2", level: null }, { id: "g-3", level: "N4" }] })])).toBe("N4");
    expect(computedLevel([sentence(cat(), { grammar: [{ id: "g-3", level: "N3" }, { id: "g-2", level: null }] })])).toBe("N3");
    expect(computedLevel([sentence(tokens(["猫", "猫", "名詞", ["w", null]], ["は", "は", "助詞"]))])).toBeUndefined();
  });

  it("4: allows no Unlevelled Word below N1 and one at N1, counting each Word once", () => {
    const toks = cat();
    toks[0]!.word = { id: "w-rare", level: null };
    toks[4]!.word = { id: "w-rare", level: null };
    expect(checkExampleSentence(draft(sentence(toks)), nekoTarget, [], config).failures).toEqual([
      { check: "unlevelled", message: "1 Word(s) have no JLPT level; at most 0 allowed. Use words from the JLPT lists." },
    ]);
    const n1: ExampleTarget = { ...nekoTarget, level: "N1" };
    expect(checks(checkExampleSentence(draft(sentence(toks)), n1, [], config))).toEqual([]);
    toks[4]!.word = { id: "w-rare-2", level: null };
    expect(checks(checkExampleSentence(draft(sentence(toks)), n1, [], config))).toEqual(["unlevelled"]);
  });

  it("5: the target must appear exactly once at the claimed span", () => {
    const twice = cat();
    twice[0]!.word = { id: "w-neko", level: "N5" };
    expect(checkExampleSentence(draft(sentence(twice)), nekoTarget, [], config).failures).toEqual([
      { check: "target", message: "The target appears 2 times; it must appear exactly once." },
    ]);
    expect(checks(checkExampleSentence(draft(sentence(cat())), { ...nekoTarget, wordId: "w-inu" }, [], config))).toEqual(["target"]);
    expect(checkExampleSentence(draft(sentence(cat())), { ...nekoTarget, span: { start: 2, end: 4 } }, [], config).failures).toEqual([
      { check: "target", message: "The target span 2–4 does not match where it appears (2–3)." },
    ]);
    expect(checks(checkExampleSentence(draft(sentence(cat())), { ...nekoTarget, span: { start: 1, end: 3 } }, [], config))).toEqual(["target"]);
  });

  it("5: resolves a Grammar Point target through its Matcher Rule", () => {
    const desu: ExampleTarget = { type: "grammar_point", rule: { pattern: [{ lemma: "です" }] }, level: "N5", span: { start: 6, end: 8 } };
    expect(checks(checkExampleSentence(draft(sentence(cat())), desu, [], config))).toEqual([]);
  });

  it("6: fails a missing or blank translation", () => {
    for (const translationEn of [null, "  "]) {
      expect(checkExampleSentence(draft(sentence(cat(), { translationEn })), nekoTarget, [], config).failures).toEqual([
        { check: "translation", message: "The English translation is missing." },
      ]);
    }
  });

  it("7: fails a duplicate or near-duplicate of an existing Sentence, ignoring punctuation", () => {
    const report = checkExampleSentence(draft(sentence(cat())), nekoTarget, ["私は猫が好きです", "犬が好き。"], config);
    expect(report.failures).toEqual([{ check: "duplicate", message: "Too close to the existing Sentence 「私は猫が好きです」. Write a different one." }]);
    expect(checks(checkExampleSentence(draft(sentence(cat())), nekoTarget, ["私は猫が好きですね。"], config))).toEqual(["duplicate"]);
    expect(checks(checkExampleSentence(draft(sentence(cat())), nekoTarget, ["私は猫が好きです。"], { ...config, nearDuplicate: 1 }))).toEqual(["duplicate"]);
  });

  it("8: fails a Sentence over its level's length cap", () => {
    const tight = { ...config, lengthCaps: { ...config.lengthCaps, N5: 8 } };
    expect(checkExampleSentence(draft(sentence(cat())), nekoTarget, [], tight).failures).toEqual([
      { check: "length", message: "9 characters; the N5 cap is 8. Shorten it." },
    ]);
    expect(checks(checkExampleSentence(draft(sentence(cat())), nekoTarget, [], { ...config, lengthCaps: { ...config.lengthCaps, N5: 9 } }))).toEqual([]);
  });
});

describe("similarity", () => {
  it("is 1 for equal text, 0 for disjoint text, and handles one-character text", () => {
    expect(similarity("猫だ。", "猫だ")).toBe(1);
    expect(similarity("猫だ", "犬よ")).toBe(0);
    expect(similarity("猫", "猫")).toBe(1);
    expect(similarity("猫", "犬")).toBe(0);
    expect(similarity("あいあい", "あい")).toBeCloseTo(0.5);
    expect(similarity("あいう", "あいえ")).toBe(0.5);
  });
});

describe("Reading Passage checks", () => {
  const passage = (...sentences: CheckedSentence[]) => sentences.map((s) => ({ sentence: s, generatorReading: s.tokens.map((t) => t.reading).join("") }));
  const dog = () => sentence(tokens(["犬", "犬", "名詞", ["w-inu", "N4"], undefined, "いぬ"], ["。", "。", "補助記号"]));

  it("passes when every target appears and the level is within the request", () => {
    const report = checkReadingPassage(passage(sentence(cat()), dog()), [{ type: "word", wordId: "w-inu" }, { type: "grammar_point", rule: { pattern: [{ lemma: "です" }] } }], "N4", [], config);
    expect(report).toEqual({ failures: [], readingDisagreements: [] });
  });

  it("runs checks 1, 6–8 per Sentence but not 4, and collects reading disagreements", () => {
    const rare = sentence(tokens(["鵺", "鵺", "名詞", ["w-nue", null]], ["ぴょ", "ぴょ", "感動詞", null]), { translationEn: null });
    const drafts = [...passage(sentence(cat()), rare), { sentence: dog(), generatorReading: "けん。" }];
    const report = checkReadingPassage(drafts, [], "N4", [dog().text], { ...config, lengthCaps: { ...config.lengthCaps, N4: 8 } });
    expect(checks(report)).toEqual(["length", "word-link", "translation", "duplicate"]);
    expect(report.readingDisagreements).toEqual([{ generator: "けん。", sudachi: "いぬ。" }]);
  });

  it("fails a missing target and a passage above the requested level", () => {
    const report = checkReadingPassage(passage(sentence(cat()), dog()), [{ type: "word", wordId: "w-tori" }, { type: "grammar_point", rule: { pattern: [{ lemma: "だ" }] } }], "N5", [], config);
    expect(report.failures).toEqual([
      { check: "target", message: "The target w-tori does not appear." },
      { check: "target", message: "The target grammar point does not appear." },
      { check: "level", message: "The text is N4, above N5. Replace the harder words or grammar." },
    ]);
  });
});

describe("Japanese Explanation checks", () => {
  const kanji = new Map<string, KanjiFacts>([
    ["動", { level: "N4", joyo: true }],
    ["物", { level: null, joyo: true }],
    ["鵺", { level: null, joyo: false }],
  ]);

  it("passes Japanese text without the headword whose Kanji are levelled or jōyō", () => {
    expect(checkJapaneseExplanation("にゃあと鳴く動物。", ["猫", "ねこ"], new Map([...kanji, ["鳴", { level: "N2", joyo: true }]]))).toEqual([]);
  });

  it("fails Latin script, full-width included", () => {
    expect(checkJapaneseExplanation("pet", [], kanji)).toEqual([{ check: "latin", message: "Write the explanation in Japanese only, with no Latin letters." }]);
    expect(checkJapaneseExplanation("ＰＥＴ", [], kanji).map((f) => f.check)).toEqual(["latin"]);
  });

  it("fails each headword used", () => {
    expect(checkJapaneseExplanation("ねこは猫。", ["猫", "ねこ", "ネコ"], new Map([["猫", { level: "N5", joyo: true }]]))).toEqual([
      { check: "headword", message: "Do not use the headword 「猫」 itself." },
      { check: "headword", message: "Do not use the headword 「ねこ」 itself." },
    ]);
  });

  it("fails each Kanji that is neither levelled nor jōyō, once, and unknown Kanji", () => {
    expect(checkJapaneseExplanation("鵺の鵺と麒", [], kanji)).toEqual([
      { check: "kanji", message: "「鵺」 is neither levelled nor jōyō. Use kana or a common Kanji." },
      { check: "kanji", message: "「麒」 is neither levelled nor jōyō. Use kana or a common Kanji." },
    ]);
    expect(checkJapaneseExplanation("麟", [], new Map([["麟", { level: "N1", joyo: false }]]))).toEqual([]);
  });
});

describe("Matcher Rule self-match", () => {
  it("fails for each of the Grammar Point's examples the rule does not match", () => {
    const rule: MatcherRule = { pattern: [{ lemma: "です" }] };
    const other = sentence(tokens(["猫", "猫", "名詞"], ["だ", "だ", "助動詞"]));
    expect(checkMatcherRule(rule, [sentence(cat()), other])).toEqual([{ check: "matcher-rule", message: "The rule does not match the example 「猫だ」." }]);
    expect(checkMatcherRule(rule, [sentence(cat())])).toEqual([]);
  });
});

describe("Batch Text checks", () => {
  const neko: TextItem = { type: "word", id: "w-neko", lemma: "猫" };
  const desu: TextItem = { type: "grammar_point", id: "g-desu", rule: { pattern: [{ lemma: "です" }] } };
  const nekoKanji: TextItem = { type: "kanji", id: "k-neko", literal: "猫" };
  const base = { sentences: [sentence(cat())], level: "N5" as Level, batch: [neko, desu, nekoKanji], earlier: [], known: new Set<string>(), length: { min: 1, max: 20 } };

  it("passes when every batch item appears and everything else is within reach", () => {
    expect(checkBatchText(base)).toEqual([]);
  });

  it("fails each batch item that does not appear", () => {
    const other = sentence(tokens(["犬", "犬", "名詞", ["w-inu", "N5"]], ["だ", "だ", "助動詞"]));
    expect(checkBatchText({ ...base, sentences: [other] })).toEqual([
      { check: "batch-item", message: "The batch word 「猫」 does not appear. Use it." },
      { check: "batch-item", message: "The batch grammar point g-desu does not appear. Use it." },
      { check: "batch-item", message: "The batch kanji 「猫」 does not appear. Use it." },
    ]);
  });

  it("does not require a batch item the Learner already Knows", () => {
    const other = sentence(tokens(["犬", "犬", "名詞", ["w-inu", "N5"]]));
    expect(checkBatchText({ ...base, sentences: [other], known: new Set(["w-neko", "g-desu", "k-neko"]) })).toEqual([]);
  });

  it("counts a Kanji only inside an allowed Word", () => {
    const hard = sentence(tokens(["猫舌", "猫舌", "名詞", ["w-nekojita", "N1"]]));
    expect(checkBatchText({ ...base, batch: [nekoKanji], sentences: [hard] }).map((f) => f.check)).toEqual(["batch-item", "out-of-reach"]);
    expect(checkBatchText({ ...base, batch: [nekoKanji], sentences: [hard], known: new Set(["w-nekojita"]) })).toEqual([]);
    const batchWord: TextItem = { type: "word", id: "w-nekojita", lemma: "猫舌" };
    expect(checkBatchText({ ...base, batch: [batchWord, nekoKanji], sentences: [hard] })).toEqual([]);
  });

  it("fails each Word or Grammar Point above the level and not Known, once; proper nouns and numbers don't count", () => {
    const s = sentence(
      tokens(
        ["猫", "猫", "名詞", ["w-neko", "N5"]],
        ["鵺", "鵺", "名詞", ["w-nue", null]],
        ["鵺", "鵺", "名詞", ["w-nue", null]],
        ["象", "象", "名詞", ["w-zou", "N3"]],
        ["東京", "東京", "名詞,固有名詞", ["w-tokyo", null]],
        ["百", "百", "名詞,数詞", ["w-hyaku", "N2"]],
      ),
      { grammar: [{ id: "g-hard", level: "N2" }, { id: "g-desu", level: "N1" }] },
    );
    expect(checkBatchText({ ...base, batch: [neko, desu], sentences: [s], length: { min: 0, max: 99 } })).toEqual([
      { check: "batch-item", message: "The batch grammar point g-desu does not appear. Use it." },
      { check: "out-of-reach", message: "「鵺」 is Unlevelled and not Known to the Learner. Replace it." },
      { check: "out-of-reach", message: "「象」 is N3 and not Known to the Learner. Replace it." },
      { check: "out-of-reach", message: "「g-hard」 is N2 and not Known to the Learner. Replace it." },
    ]);
    expect(checkBatchText({ ...base, batch: [neko], sentences: [s], known: new Set(["w-nue", "w-zou", "g-hard", "g-desu"]), length: { min: 0, max: 99 } })).toEqual([]);
  });

  it("for an Unlevelled batch allows anything levelled or Known", () => {
    const s = sentence(tokens(["象", "象", "名詞", ["w-zou", "N1"]], ["鵺", "鵺", "名詞", ["w-nue", null]]));
    expect(checkBatchText({ ...base, level: null, batch: [], sentences: [s], length: { min: 5, max: 20 } }).map((f) => f.message)).toEqual([
      "「鵺」 is Unlevelled and not Known to the Learner. Replace it.",
      "2 characters; aim for 5–20.",
    ]);
  });

  it("needs at least half of the earlier items", () => {
    const earlier: TextItem[] = [
      { type: "word", id: "w-watashi", lemma: "私" },
      { type: "word", id: "w-inu", lemma: "犬" },
      { type: "word", id: "w-tori", lemma: "鳥" },
    ];
    expect(checkBatchText({ ...base, earlier })).toEqual([{ check: "reuse", message: "Only 1 of the 3 given items appear; use at least half." }]);
    expect(checkBatchText({ ...base, earlier: earlier.slice(0, 2) })).toEqual([]);
  });

  it("keeps the whole text within the length range, inclusive", () => {
    expect(checkBatchText({ ...base, length: { min: 9, max: 9 } })).toEqual([]);
    expect(checkBatchText({ ...base, length: { min: 10, max: 20 } })).toEqual([{ check: "length", message: "9 characters; aim for 10–20." }]);
    expect(checkBatchText({ ...base, length: { min: 1, max: 8 } }).map((f) => f.check)).toEqual(["length"]);
  });
});

describe("Practice Text checks", () => {
  const weakest: TextItem[] = [
    { type: "word", id: "w-suki", lemma: "好き" },
    { type: "word", id: "w-inu", lemma: "犬" },
  ];

  it("passes within reach, with half the weakest items, within length", () => {
    expect(checkPracticeText({ sentences: [sentence(cat())], level: "N5", weakest, known: new Set(), length: { min: 1, max: 20 } })).toEqual([]);
  });

  it("fails out-of-reach items, too few weakest items and a bad length", () => {
    const s = sentence(tokens(["象", "象", "名詞", ["w-zou", "N3"]]));
    expect(checkPracticeText({ sentences: [s], level: "N4", weakest, known: new Set(), length: { min: 5, max: 20 } }).map((f) => f.check)).toEqual([
      "out-of-reach",
      "reuse",
      "length",
    ]);
  });
});
