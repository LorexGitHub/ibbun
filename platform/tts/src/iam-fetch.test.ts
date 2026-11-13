import { describe, expect, it } from "vitest";
import { createIamFetch, credentialsFromEnv, functionUrlRegion, signRequest, type SigningScope } from "./iam-fetch.ts";
import { createVoicevoxTts } from "./voicevox.ts";

const HOST = "abc.lambda-url.eu-central-1.on.aws";
const NOW = new Date("2026-11-13T18:00:00Z");
const SCOPE: SigningScope = {
  credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", sessionToken: "TOKEN/with+chars=" },
  region: "eu-central-1",
  service: "lambda",
};
const CREDENTIAL = "Credential=AKIDEXAMPLE/20261113/eu-central-1/lambda/aws4_request";

// Expected signatures come from @smithy/signature-v4, the AWS SDK's signer, for the same requests.
describe("signRequest", () => {
  it("signs a POST with a kana query and a JSON body as the AWS SDK does", () => {
    const url = new URL(`https://${HOST}/accent_phrases?text=${encodeURIComponent("ネ'コ")}&speaker=2&is_kana=true`);
    const headers = signRequest({ method: "post", url, headers: { "Content-Type": "application/json" }, body: '{"a":1}' }, SCOPE, NOW);
    expect(headers).toEqual({
      "content-type": "application/json",
      "x-amz-date": "20261113T180000Z",
      "x-amz-content-sha256": "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
      "x-amz-security-token": "TOKEN/with+chars=",
      authorization: `AWS4-HMAC-SHA256 ${CREDENTIAL}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=f36b17fc6252bf46faceed05963a3b9f3a81747beb0af64b45f5717a84545dee`,
    });
  });

  it("signs a GET without a body as the AWS SDK does", () => {
    const headers = signRequest({ method: "GET", url: new URL(`https://${HOST}/version`) }, SCOPE, NOW);
    expect(headers.authorization).toBe(
      `AWS4-HMAC-SHA256 ${CREDENTIAL}, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=cea013591b12a9c5ca46b42eee9ca13fe1b45d3004db2b6a6c9279e50e324bab`,
    );
  });

  it("leaves the security token out when the credentials have none", () => {
    const { sessionToken: _, ...longLived } = SCOPE.credentials;
    const headers = signRequest({ method: "GET", url: new URL(`https://${HOST}/version`) }, { ...SCOPE, credentials: longLived }, NOW);
    expect(headers).not.toHaveProperty("x-amz-security-token");
    expect(headers.authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date,");
  });

  it("sorts query parameters by name, then by value", () => {
    const sign = (query: string) => signRequest({ method: "GET", url: new URL(`https://${HOST}/v?${query}`) }, SCOPE, NOW).authorization;
    expect(sign("b=1&a=2&a=1")).toBe(sign("a=1&a=2&b=1"));
    expect(sign("a=1&b=2")).not.toBe(sign("a=2&b=1"));
  });
});

describe("createIamFetch", () => {
  it("sends the request to the same URL with its signed headers", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const send = (async (url: URL, init: RequestInit) => (sent.push({ url: String(url), init }), new Response("ok"))) as typeof fetch;
    const url = `https://${HOST}/accent_phrases?text=${encodeURIComponent("ネ'コ")}&speaker=2&is_kana=true`;
    await createIamFetch(SCOPE, send, () => NOW)(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
    expect(new URL(sent[0]!.url).href).toBe(new URL(url).href);
    expect(sent[0]!.init).toMatchObject({ method: "POST", body: '{"a":1}' });
    expect((sent[0]!.init.headers as Record<string, string>).authorization).toMatch(/Signature=f36b17fc/);
  });

  it("signs a GET with an empty body hash", async () => {
    let headers: Record<string, string> = {};
    const send = (async (_: URL, init: RequestInit) => ((headers = init.headers as Record<string, string>), new Response("ok"))) as typeof fetch;
    await createIamFetch(SCOPE, send, () => NOW)(new Request(`https://${HOST}/version`));
    expect(headers.authorization).toMatch(/Signature=cea01359/);
  });
});

describe("functionUrlRegion", () => {
  it("reads the region from a Lambda function URL", () => {
    expect(functionUrlRegion(`https://${HOST}/`)).toBe("eu-central-1");
  });

  it.each(["http://localhost:50021", "http://voicevox:50021", "https://example.com/abc.lambda-url.eu-central-1.on.aws"])("is undefined for %s", (url) => {
    expect(functionUrlRegion(url)).toBeUndefined();
  });
});

describe("credentialsFromEnv", () => {
  it("takes the Lambda runtime's keys and session token", () => {
    expect(credentialsFromEnv({ AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret", AWS_SESSION_TOKEN: "token" })).toEqual({
      accessKeyId: "id",
      secretAccessKey: "secret",
      sessionToken: "token",
    });
    expect(credentialsFromEnv({ AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" })).toEqual({ accessKeyId: "id", secretAccessKey: "secret" });
  });

  it.each([{ AWS_ACCESS_KEY_ID: "id" }, { AWS_SECRET_ACCESS_KEY: "secret" }])("names the missing keys in %o", (env) => {
    expect(() => credentialsFromEnv(env)).toThrow("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
  });
});

describe("VOICEVOX tts on a function URL", () => {
  const recorder = () => {
    const seen: Headers[] = [];
    const send = (async (_: URL, init: RequestInit = {}) => (seen.push(new Headers(init.headers)), Response.json("0.24.1"))) as typeof fetch;
    return { seen, send };
  };
  const env = { AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" };

  it("signs its calls with the role's credentials", async () => {
    const { seen, send } = recorder();
    await createVoicevoxTts({ url: `https://${HOST}`, fetch: send, env }).engineVersion();
    expect(seen[0]!.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=id\/\d{8}\/eu-central-1\/lambda\/aws4_request, /);
  });

  it("calls a local engine unsigned", async () => {
    const { seen, send } = recorder();
    await createVoicevoxTts({ url: "http://localhost:50021", fetch: send, env }).engineVersion();
    expect(seen[0]!.get("authorization")).toBeNull();
  });
});
