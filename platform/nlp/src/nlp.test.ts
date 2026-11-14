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

describe("Sudachi nlp, on a Lambda function URL", () => {
  const FUNCTION_URL = "https://abc123.lambda-url.eu-central-1.on.aws";
  const credentials = async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret", sessionToken: "session" });
  const headersOf = async (text: string) => {
    const sidecar = replay();
    await createSudachiNlp({ url: FUNCTION_URL, fetch: sidecar.fetch, credentials }).tokenize(text);
    return sidecar.seen[0]!.init.headers as Record<string, string>;
  };

  it("signs each call with SigV4 for the lambda service in the URL's region", async () => {
    const headers = await headersOf(SENTENCE);
    expect(headers["authorization"]).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-central-1\/lambda\/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/,
    );
    expect(headers).toMatchObject({ "content-type": "application/json", "x-amz-security-token": "session" });
  });

  it("signs the body, so a different text carries a different signature", async () => {
    const signature = async (text: string) => (await headersOf(text))["authorization"]!.split("Signature=")[1];
    expect(await signature("打合せ")).not.toBe(await signature(SENTENCE));
  });

  it("asks for credentials on every call, so a Fargate task's rotated container credentials are picked up", async () => {
    const keys = ["AKIDFIRST", "AKIDSECOND"];
    const sidecar = replay();
    const nlp = createSudachiNlp({ url: FUNCTION_URL, fetch: sidecar.fetch, credentials: async () => ({ accessKeyId: keys.shift()!, secretAccessKey: "secret" }) });
    await nlp.tokenize(SENTENCE);
    await nlp.tokenize(SENTENCE);
    const ids = sidecar.seen.map(({ init }) => /Credential=(\w+)\//.exec((init.headers as Record<string, string>)["authorization"]!)?.[1]);
    expect(ids).toEqual(["AKIDFIRST", "AKIDSECOND"]);
  });

  it("refuses to call without credentials, naming the URL, and sends nothing", async () => {
    const sidecar = replay();
    const nlp = createSudachiNlp({ url: FUNCTION_URL, fetch: sidecar.fetch, credentials: () => Promise.reject(new Error("no provider")) });
    await expect(nlp.tokenize(SENTENCE)).rejects.toThrow(new NlpError(`Sudachi at ${FUNCTION_URL} needs AWS credentials to sign its calls`));
    expect(sidecar.seen).toEqual([]);
  });

  it("calls a plain HTTP sidecar unsigned, even with credentials around", async () => {
    const sidecar = replay();
    await createSudachiNlp({ url: "http://sudachi.test", fetch: sidecar.fetch, credentials }).tokenize(SENTENCE);
    expect(sidecar.seen[0]!.init.headers).toEqual({ "Content-Type": "application/json" });
  });
});

/** What a function URL does on AWS: wrap the HTTP request in a payload 2.0 event, invoke, unwrap the answer. */
const viaFunctionUrl =
  (invocations: string): typeof fetch =>
  async (url, init = {}) => {
    const { pathname } = new URL(String(url));
    const method = init.method ?? "GET";
    const event = {
      version: "2.0",
      rawPath: pathname,
      rawQueryString: "",
      headers: init.headers,
      requestContext: { http: { method, path: pathname, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "nlp-test" } },
      body: init.body,
      isBase64Encoded: false,
    };
    const answer = (await (await fetch(invocations, { method: "POST", body: JSON.stringify(event) })).json()) as { statusCode: number; body: string };
    return new Response(answer.body, { status: answer.statusCode });
  };

// Run the image under the emulator with SUDACHI_RIE_URL=http://localhost:9000, after
// docker run -p 9000:8080 -v <dir with aws-lambda-rie>:/rie --entrypoint /rie/aws-lambda-rie <docker/sudachi image> python server.py
describe.runIf(process.env.SUDACHI_RIE_URL)("Sudachi nlp, against the Lambda image under the Runtime Interface Emulator at SUDACHI_RIE_URL", () => {
  nlpContract(() => createSudachiNlp({ url: "http://sudachi.lambda", fetch: viaFunctionUrl(`${process.env.SUDACHI_RIE_URL}/2015-03-31/functions/function/invocations`) }));
});
