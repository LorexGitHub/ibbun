// End-to-end check of the stack running under `npm run dev`.
// Usage: node scripts/smoke-local.ts   (reads outputs of the dev_* stage in .alchemy/state)
import { readdirSync, readFileSync } from "node:fs";

const EMULATOR = "http://localhost:4566";
const stateDir = ".alchemy/state/mojibun";
const stage = process.env.ALCHEMY_STAGE ?? readdirSync(stateDir).find((name) => name.startsWith("dev_"));
const outputs = JSON.parse(readFileSync(`${stateDir}/${stage}/__stack_output__.json`, "utf8")) as {
  url: string;
  userPoolId: string;
  userPoolClientId: string;
  contentBucket: string;
};

// The emulator accepts any well-formed signature.
const awsAuth = (service: string) =>
  `AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/${service}/aws4_request, SignedHeaders=host, Signature=0`;

const cognito = async (action: string, body: object) => {
  const res = await fetch(EMULATOR, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `AWSCognitoIdentityProviderService.${action}`,
      authorization: awsAuth("cognito-idp"),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${action}: ${res.status} ${await res.text()}`);
  return res.json();
};

let failed = false;
const check = (name: string, want: unknown, got: unknown) => {
  const ok = JSON.stringify(want) === JSON.stringify(got);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
  failed ||= !ok;
};
const api = (path: string, init: RequestInit = {}) => fetch(`${outputs.url}${path}`, init);

check("public health route", 200, (await api("/api/health")).status);
check("learner route without token is rejected", 401, (await api("/api/me/items")).status);

const forgedPayload = Buffer.from(JSON.stringify({ sub: "intruder", token_use: "id" })).toString("base64url");
const forged = `eyJhbGciOiJSUzI1NiJ9.${forgedPayload}.c2lnbmF0dXJl`;
check("forged token is rejected", 401, (await api("/api/me/items", { headers: { authorization: `Bearer ${forged}` } })).status);

const email = `smoke-${Date.now()}@example.com`;
const password = "Correct-Horse-1";
await cognito("AdminCreateUser", { UserPoolId: outputs.userPoolId, Username: email, MessageAction: "SUPPRESS" });
await cognito("AdminSetUserPassword", { UserPoolId: outputs.userPoolId, Username: email, Password: password, Permanent: true });
const { AuthenticationResult } = await cognito("InitiateAuth", {
  ClientId: outputs.userPoolClientId,
  AuthFlow: "USER_PASSWORD_AUTH",
  AuthParameters: { USERNAME: email, PASSWORD: password },
});
const headers = { authorization: `Bearer ${AuthenticationResult.IdToken}`, "content-type": "application/json" };

const review = await api("/api/me/reviews", { method: "POST", headers, body: JSON.stringify({ kind: "kanji", id: "男", grade: 3 }) });
check("record a Review", 200, review.status);
const known = await api("/api/me/items/word/dansei", { method: "PUT", headers, body: JSON.stringify({ known: true }) });
check("mark a Word Known", 200, known.status);
check("invalid Review is rejected", 400, (await api("/api/me/reviews", { method: "POST", headers, body: JSON.stringify({ kind: "kanji", id: "男", grade: 9 }) })).status);

const { items } = (await (await api("/api/me/items", { headers })).json()) as { items: Array<{ kind: string; id: string; reviewCount?: number; known?: boolean }> };
check("Learner state reads back", 2, items.length);
check("Review counted on the Study Item", 1, items.find((item) => item.kind === "kanji" && item.id === "男")?.reviewCount);
check("Known flag stored", true, items.find((item) => item.kind === "word" && item.id === "dansei")?.known);

await fetch(`${EMULATOR}/${outputs.contentBucket}/content/kanji/n5.json`, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: awsAuth("s3") },
  body: JSON.stringify({ kanji: "男", readings: ["だん", "おとこ"] }),
});
check("router serves the app shell", 200, (await api("/")).status);
const bundle = await api("/content/kanji/n5.json");
check("router serves content bundles", { status: 200, kanji: "男" }, { status: bundle.status, kanji: bundle.ok ? (await bundle.json()).kanji : null });

process.exit(failed ? 1 : 0);
