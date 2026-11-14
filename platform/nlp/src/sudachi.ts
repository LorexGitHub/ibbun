import { AwsClient } from "aws4fetch";
import { z } from "zod";
import type { Nlp, Token } from "./nlp.ts";

const UNSET = "*";

/** Sudachi's six part-of-speech fields: four POS levels, then 活用型 and 活用形, with "*" for unused ones. */
const SidecarToken = z
  .object({
    surface: z.string(),
    lemma: z.string(),
    reading: z.string(),
    pos: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]),
  })
  .transform(
    ({ pos, ...rest }): Token => ({
      ...rest,
      partOfSpeech: pos.slice(0, 4).filter((level) => level !== UNSET),
      conjugation: pos[4] === UNSET ? null : { type: pos[4], form: pos[5] },
    }),
  );

const SidecarResponse = z.object({ tokens: z.array(SidecarToken) });

/** The Sudachi sidecar (docker/sudachi) answered with something other than tokens. */
export class NlpError extends Error {
  override readonly name = "NlpError";
}

export type SudachiOptions = {
  /** Base URL of the sidecar: http://localhost:8000 locally, a Lambda function URL on AWS. */
  readonly url: string;
  readonly fetch?: typeof fetch;
  /** Where a function URL's IAM credentials come from: the Lambda's own environment. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

/** A Lambda function URL's host names its region: <id>.lambda-url.<region>.on.aws. */
const FUNCTION_URL_HOST = /\.lambda-url\.([a-z0-9-]+)\.on\.aws$/;

/** On AWS, Sudachi is a function URL with AWS_IAM auth, so each call is signed with SigV4 (ADR 0015). Locally it is plain HTTP. */
const signerFor = (url: string, env: SudachiOptions["env"] = {}): AwsClient | null => {
  const region = FUNCTION_URL_HOST.exec(new URL(url).hostname)?.[1];
  if (!region) return null;
  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_SESSION_TOKEN: sessionToken } = env;
  if (!accessKeyId || !secretAccessKey) throw new NlpError(`Sudachi at ${url} needs AWS credentials to sign its calls`);
  return new AwsClient({ accessKeyId, secretAccessKey, sessionToken, service: "lambda", region });
};

/** The Sudachi sidecar client. */
export const createSudachiNlp = ({ url, fetch: send = fetch, env = process.env }: SudachiOptions): Nlp => {
  const signer = signerFor(url, env);
  return {
    async tokenize(text) {
      const endpoint = new URL("/tokenize", url);
      const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
      const signed = signer ? { ...init, headers: Object.fromEntries((await signer.sign(String(endpoint), init)).headers) } : init;
      const response = await send(endpoint, signed);
      if (!response.ok) throw new NlpError(`Sudachi sidecar answered ${response.status}: ${await response.text()}`);
      return SidecarResponse.parse(await response.json()).tokens;
    },
  };
};
