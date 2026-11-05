import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeNlp, createSudachiNlp, NlpError, type Nlp, type Token } from "./index.ts";

const SENTENCE = "昨日、猫が魚を食べました。";

/** What the sidecar (SudachiDict-core 20250129, mode C) makes of SENTENCE and of 打合せ. */
const noun = (surface: string, reading: string, kind = "一般"): Token => ({
  surface,
  lemma: surface,
  reading,
  partOfSpeech: ["名詞", "普通名詞", kind],
  conjugation: null,
});
const particle = (surface: string, reading: string): Token => ({
  surface,
  lemma: surface,
  reading,
  partOfSpeech: ["助詞", "格助詞"],
  conjugation: null,
});
const symbol = (surface: string, kind: string): Token => ({
  surface,
  lemma: surface,
  reading: surface,
  partOfSpeech: ["補助記号", kind],
  conjugation: null,
});
const EXPECTED: Token[] = [
  noun("昨日", "キノウ", "副詞可能"),
  symbol("、", "読点"),
  noun("猫", "ネコ"),
  particle("が", "ガ"),
  noun("魚", "サカナ"),
  particle("を", "ヲ"),
  {
    surface: "食べ",
    lemma: "食べる",
    reading: "タベ",
    partOfSpeech: ["動詞", "一般"],
    conjugation: { type: "下一段-バ行", form: "連用形-一般" },
  },
  {
    surface: "まし",
    lemma: "ます",
    reading: "マシ",
    partOfSpeech: ["助動詞"],
    conjugation: { type: "助動詞-マス", form: "連用形-一般" },
  },
  { surface: "た", lemma: "た", reading: "タ", partOfSpeech: ["助動詞"], conjugation: { type: "助動詞-タ", form: "終止形-一般" } },
  symbol("。", "句点"),
];
const UCHIAWASE: Token = noun("打合せ", "ウチアワセ", "サ変可能");

/** Behaviour every Nlp shares. */
const nlpContract = (make: () => Nlp) => {
  it("splits a sentence into tokens with lemma, reading, part of speech and conjugation", async () => {
    expect(await make().tokenize(SENTENCE)).toEqual(EXPECTED);
  });

  it("keeps a spelling variant's own lemma", async () => {
    expect(await make().tokenize("打合せ")).toEqual([UCHIAWASE]);
  });

  it("returns no tokens for empty text", async () => {
    expect(await make().tokenize("")).toEqual([]);
  });
};

describe("fake nlp", () => {
  nlpContract(() => createFakeNlp([...EXPECTED, UCHIAWASE]));

  it.each([
    ["shortest", [noun("子", "コ"), noun("猫", "ネコ"), noun("子猫", "コネコ")]],
    ["longest", [noun("子猫", "コネコ"), noun("猫", "ネコ"), noun("子", "コ")]],
  ])("takes the longest token that matches, given the %s first", async (_, lexicon) => {
    expect((await createFakeNlp(lexicon).tokenize("子猫猫子")).map((t) => t.surface)).toEqual(["子猫", "猫", "子"]);
  });

  it("rejects text it has no token for, naming where it stopped", async () => {
    await expect(createFakeNlp(EXPECTED).tokenize("猫が犬を")).rejects.toThrow('fake nlp has no token for "犬を"');
    await expect(createFakeNlp([]).tokenize("猫")).rejects.toThrow('"猫"');
  });
});

const recorded = readFileSync(new URL("./fixtures/sentence.json", import.meta.url), "utf8");
const UCHIAWASE_RECORDED = {
  tokens: [{ surface: "打合せ", reading: "ウチアワセ", lemma: "打合せ", pos: ["名詞", "普通名詞", "サ変可能", "*", "*", "*"] }],
};

/** Answers like the sidecar did when the fixtures were recorded, and records each request. */
const replay = (answer?: Response) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    seen.push({ url: String(url), init });
    if (answer) return answer;
    const { text } = JSON.parse(String(init.body)) as { text: string };
    const answers: Record<string, string> = { [SENTENCE]: recorded, 打合せ: JSON.stringify(UCHIAWASE_RECORDED), "": '{"tokens": []}' };
    return new Response(answers[text]);
  };
  return { fetch: fetch as typeof globalThis.fetch, seen };
};

describe("Sudachi nlp, replaying recorded answers", () => {
  nlpContract(() => createSudachiNlp({ url: "http://sudachi.test", fetch: replay().fetch }));

  it("posts the text as JSON to the sidecar's /tokenize", async () => {
    const sidecar = replay();
    await createSudachiNlp({ url: "http://sudachi.test:8000", fetch: sidecar.fetch }).tokenize(SENTENCE);
    expect(sidecar.seen).toEqual([
      {
        url: "http://sudachi.test:8000/tokenize",
        init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: SENTENCE }) },
      },
    ]);
  });

  it("rejects with the sidecar's answer when it fails", async () => {
    const nlp = createSudachiNlp({ url: "http://sudachi.test", fetch: replay(new Response("boom", { status: 500 })).fetch });
    const error = await nlp.tokenize(SENTENCE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NlpError);
    expect(error).toMatchObject({ name: "NlpError", message: "Sudachi sidecar answered 500: boom" });
  });

  it("rejects an answer that is not Sudachi's token shape", async () => {
    const fivePos = JSON.stringify({ tokens: [{ ...UCHIAWASE_RECORDED.tokens[0], pos: ["名詞", "*", "*", "*", "*"] }] });
    await expect(createSudachiNlp({ url: "http://sudachi.test", fetch: replay(new Response(fivePos)).fetch }).tokenize("打合せ")).rejects.toThrow();
  });
});

describe.runIf(process.env.SUDACHI_URL)("Sudachi nlp, against the sidecar at SUDACHI_URL", () => {
  nlpContract(() => createSudachiNlp({ url: process.env.SUDACHI_URL! }));
});
