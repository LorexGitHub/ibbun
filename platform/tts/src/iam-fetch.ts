// AWS Signature Version 4 for calls to a Lambda function URL with IAM auth
// (ADR 0015). Hand-written with node:crypto so the worker needs no AWS SDK.
import { createHash, createHmac } from "node:crypto";

export type AwsCredentials = { readonly accessKeyId: string; readonly secretAccessKey: string; readonly sessionToken?: string };

export type SigningScope = { readonly credentials: AwsCredentials; readonly region: string; readonly service: string };

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Encoded pairs sorted by name, then value: "\0" sorts below every character a name can hold. */
export const canonicalQuery = (params: URLSearchParams) =>
  [...params].map(([k, v]) => `${encode(k)}\0${encode(v)}`).sort().map((pair) => pair.replace("\0", "=")).join("&");

/** The headers that sign one request. `body` must be the exact bytes sent. */
export const signRequest = (
  { method, url, headers = {}, body = "" }: { method: string; url: URL; headers?: Record<string, string>; body?: string | Uint8Array },
  { credentials, region, service }: SigningScope,
  now: Date,
): Record<string, string> => {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const signed: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(credentials.sessionToken ? { "x-amz-security-token": credentials.sessionToken } : {}),
  };
  const names = Object.keys(signed).sort();
  const canonical = [
    method.toUpperCase(),
    url.pathname.split("/").map((segment) => encode(decodeURIComponent(segment))).join("/"),
    canonicalQuery(url.searchParams),
    names.map((n) => `${n}:${signed[n]}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = [day, region, service, "aws4_request"].reduce<Buffer | string>((k, part) => hmac(k, part), `AWS4${credentials.secretAccessKey}`);
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  const { host: _host, ...sent } = signed;
  return { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
};

/** A fetch that signs every request for `service` in `region`. Bodies must be strings, as the VOICEVOX client sends them. */
export const createIamFetch = (scope: SigningScope, send: typeof fetch = fetch, clock = () => new Date()): typeof fetch =>
  (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = typeof init.body === "string" ? init.body : "";
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    return send(url, { ...init, headers: signRequest({ method: init.method || "GET", url, headers, body }, scope, clock()) });
  }) as typeof fetch;

const FUNCTION_URL = /\.lambda-url\.([a-z0-9-]+)\.on\.aws$/;

/** A Lambda function URL's region, or undefined for any other URL, such as a local engine. */
export const functionUrlRegion = (url: string) => FUNCTION_URL.exec(new URL(url).hostname)?.[1];

/** The Lambda's own credentials, which the runtime puts in the environment. */
export const credentialsFromEnv = (env: Record<string, string | undefined>): AwsCredentials => {
  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_SESSION_TOKEN: sessionToken } = env;
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set to call a Lambda function URL");
  return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
};
