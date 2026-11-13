// The half of the smoke test that stands in for AWS: a Claude stub, and the SQS trigger that the
// Runtime Interface Emulator lacks, which hands queued jobs to the Lambda one at a time.
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { createServer } from "node:http";
import pg from "pg";

const { QUEUE_URL, LAMBDA_URL, CLAUDE_STUB_PORT, DATABASE_URL } = process.env as Record<string, string>;
const learnerId = "00000257-0000-7000-8000-000000000001";

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
    const answer = model.includes("opus") ? review : passage;
    console.log(`claude stub: ${model}`);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "msg_stub", type: "message", role: "assistant", model, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(answer) }],
      usage: { input_tokens: 100, output_tokens: 100 },
    }));
  });
}).listen(Number(CLAUDE_STUB_PORT));

const sqs = new SQSClient({ region: "eu-central-1", endpoint: new URL(QUEUE_URL).origin, credentials: { accessKeyId: "local", secretAccessKey: "local" } });
const db = new pg.Client(DATABASE_URL);
await db.connect();

const { rows: items } = await db.query("select id from content_graph.study_item where type = 'word' order by id limit 3");
const itemIds = items.map((r) => r.id);
await sqs.send(new SendMessageCommand({
  QueueUrl: QUEUE_URL,
  MessageBody: JSON.stringify({ name: "batch-text.generate", payload: { learnerId, level: "N5", itemIds } }),
}));
console.log(`enqueued batch-text.generate for ${itemIds.length} items`);

const invoke = async (record: { messageId: string; body: string }) => {
  const response = await fetch(`${LAMBDA_URL}/2015-03-31/functions/function/invocations`, { method: "POST", body: JSON.stringify({ Records: [record] }) });
  return (await response.json()) as { batchItemFailures?: unknown[]; errorMessage?: string };
};

const batchText = async () => {
  const { rows: [text] } = await db.query("select passage_id, detail from progress.texts where learner_id = $1 and kind = 'batch'", [learnerId]);
  return text;
};

const deadline = Date.now() + 120_000;
let found;
while (!(found = await batchText()) && Date.now() < deadline) {
  const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }));
  for (const m of Messages) {
    const { name } = JSON.parse(m.Body!);
    const result = await invoke({ messageId: m.MessageId!, body: m.Body! });
    console.log(`lambda ran ${name}: ${JSON.stringify(result)}`);
    if (!result.errorMessage && !result.batchItemFailures?.length) await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: m.ReceiptHandle! }));
  }
}
claude.close();
await db.end();
if (!found) throw new Error("no Batch Text was written");
console.log(`Batch Text written: passage ${found.passage_id}, episode ${found.detail.episode}`);
