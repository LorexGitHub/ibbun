// The smoke test for the stack under `alchemy dev` (issue #259): sign up, verify the mail, study a Learn
// batch, get a Batch Text, play a Listening Clip. Everything goes through the CloudFront router, the API
// Lambda, the queue and the worker Lambda that the emulator runs. Claude is stubbed at its HTTP boundary.
//
//   POSTGRES_PORT=5459 pnpm exec alchemy dev       (leave it running)
//   DATABASE_URL=postgres://ibbun:ibbun@localhost:5459/ibbun node scripts/infra/tests/smoke.mjs
//
// It reads the stack's outputs from .alchemy/state/ibbun/<stage>/__stack_output__.json, as
// ALCHEMY_STAGE names the stage (default: the first dev_* stage).
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createSudachiNlp } from "../../../platform/nlp/src/index.ts";

const stateDir = ".alchemy/state/ibbun";
const stage = process.env.ALCHEMY_STAGE ?? readdirSync(stateDir).find((name) => name.startsWith("dev_"));
const outputs = JSON.parse(readFileSync(`${stateDir}/${stage}/__stack_output__.json`, "utf8"));
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const CLAUDE_STUB_PORT = Number(process.env.CLAUDE_STUB_PORT ?? 8787);
const EMULATOR = process.env.EMULATOR_URL ?? "http://localhost:4566";
const { DATABASE_URL = "postgres://ibbun:ibbun@localhost:5432/ibbun", SUDACHI_URL = "http://localhost:8000" } = process.env;

// pg is a dependency of apps/worker, not of the root.
const pg = createRequire(new URL("../../../apps/worker/package.json", import.meta.url))("pg");

let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: ${detail}`}`);
  failed ||= !ok;
  return ok;
};
const until = async (what, find, seconds = 120) => {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const found = await find();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

// Claude, as the worker Lambda reaches it through ANTHROPIC_BASE_URL.
const passage = {
  title: "はじめての えき",
  sentences: [{ text: "わたしは えきへ いきます。", translationEn: "I go to the station." }],
  cast: ["たなかさん"],
  episodeSummary: "たなかさん goes to the station.",
};
const review = { verdicts: [], confidence: 1, bothReadingsAcceptable: true };
const claude = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { model } = JSON.parse(body);
    console.log(`  claude stub asked for ${model}`);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "msg_stub", type: "message", role: "assistant", model, stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: JSON.stringify(model.includes("opus") ? review : passage) }],
        usage: { input_tokens: 100, output_tokens: 100 },
      }),
    );
  });
}).listen(CLAUDE_STUB_PORT);

const api = (path, init = {}) => fetch(`${outputs.url}${path}`, { redirect: "manual", ...init, headers: { origin: outputs.url, ...init.headers } });
const json = (path, cookie, body) =>
  api(path, { method: body ? "POST" : "GET", headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// What quiz input passes one facet: the reading for a Japanese facet, the first meaning for a meaning facet.
const inputFor = ({ answerData }) => (answerData.facet === "japanese" ? (answerData.accepted[0].reading ?? answerData.accepted[0].written) : answerData.meanings[0].text);

const db = new pg.Client(DATABASE_URL);
await db.connect();
try {
  // 1. The router serves the web app and the API.
  check("router serves the web app", (await api("/")).status === 200);
  check("router serves a client route from the app shell", (await api("/learn")).status === 200);
  check("router reaches the API function", (await api("/api/health")).status === 200);

  // 2. Sign up and verify the mailed link.
  const email = `smoke-${Date.now()}@ibbun.test`;
  const password = "a long and unusual passphrase";
  const signUp = await post("/api/auth/sign-up/email", { email, password, name: "Smoke" });
  check("sign up", signUp.status === 200, `${signUp.status} ${await signUp.text()}`);
  const link = await until("the verification mail", async () => {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = found.messages?.[0]?.ID;
    if (!id) return null;
    const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
    return /https?:\/\/\S+/.exec(message.Text)?.[0];
  }, 30);
  check("the mail links to the router", link.startsWith(outputs.url), link);
  const verified = await fetch(link, { redirect: "manual" });
  check("the link verifies the address", verified.status === 302, `${verified.status}`);
  const signIn = await post("/api/auth/sign-in/email", { email, password });
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("log in", signIn.status === 200 && cookie.length > 0, `${signIn.status}`);

  // 3. Study a Learn batch: read the lessons, answer every quiz question from its answer data.
  const batch = await (await json("/api/learn/batch?level=N5", cookie)).json();
  const prompts = batch.items.flatMap((item) => (item.prompt ? [item.prompt] : []));
  check("the Learn batch has lessons", prompts.length > 0, JSON.stringify(batch).slice(0, 200));
  const answers = prompts.map((prompt) => ({
    studyItemId: prompt.studyItemId,
    exampleId: prompt.exampleId,
    facets: prompt.facets.map((facet) => ({ facet: facet.facet, input: inputFor(facet) })),
  }));
  const complete = await json("/api/learn/complete", cookie, { answers });
  const done = await complete.json();
  check("the quiz is recorded as Reviews", complete.status === 200 && done.recorded === answers.length, `${complete.status} ${JSON.stringify(done)}`);

  // 4. A Batch Text: the API queues it on SQS, the worker Lambda writes it with Claude (stubbed).
  const ids = prompts.map((p) => p.studyItemId);
  const queued = await (await json("/api/learn/batch-text", cookie, { studyItemIds: ids })).json();
  check("the Batch Text is queued", queued.enqueued === true, JSON.stringify(queued));
  const { rows: [learner] } = await db.query("select id from learner.learners where email = $1", [email]);
  const written = await until("the Batch Text", async () => (await db.query("select passage_id from progress.texts where learner_id = $1 and kind = 'batch'", [learner.id])).rows[0], 180);
  check("the worker Lambda wrote the Batch Text", Boolean(written));
  // content.review has no rubric for batch texts yet, so the passage stays a draft and the API still says "preparing".
  const status = await (await json(`/api/learn/batch-text?ids=${ids.join(",")}`, cookie)).json();
  console.log(`  the API reports the Batch Text as ${status.status}`);

  // 5. A Listening Clip: queue its synthesis, then fetch the audio through the router's /audio/* route.
  const { rows: [sentence] } = await db.query("select id, text from content_graph.sentence where approval = 'approved' and not retired order by id limit 1");
  check("an approved Sentence to voice exists", Boolean(sentence));
  // The fixture's Sentences are not tokenised, and the kana VOICEVOX speaks is built from tokens. Sudachi runs in Compose here.
  await db.query("update content_graph.sentence set tokens = $1 where id = $2", [JSON.stringify(await createSudachiNlp({ url: SUDACHI_URL }).tokenize(sentence.text)), sentence.id]);
  const send = await fetch(EMULATOR, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.0",
      "x-amz-target": "AmazonSQS.SendMessage",
      authorization: "AWS4-HMAC-SHA256 Credential=test/20260101/us-east-1/sqs/aws4_request, SignedHeaders=host, Signature=0",
    },
    body: JSON.stringify({ QueueUrl: outputs.jobsQueue, MessageBody: JSON.stringify({ name: "listening.synthesise", payload: { target: { kind: "sentence", sentenceId: sentence.id } } }) }),
  });
  check("the synthesis job is queued", send.ok, `${send.status} ${await send.text()}`);
  const key = await until("the Sentence's audio", async () => (await db.query("select audio_key from content_graph.sentence where id = $1", [sentence.id])).rows[0]?.audio_key, 180);
  const audio = await api(`/audio/${key}`);
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const type = audio.headers.get("content-type");
  check("the audio plays through /audio/*", audio.status === 200 && bytes.length > 1000 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS" && type === "audio/ogg", `${audio.status} ${type}, ${bytes.length} bytes`);
} catch (error) {
  check("the smoke test ran to the end", false, String(error));
} finally {
  claude.close();
  await db.end();
}
process.exit(failed ? 1 : 0);
