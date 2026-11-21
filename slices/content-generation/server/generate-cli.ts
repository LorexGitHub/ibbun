// `pnpm content:generate --level N5 [--learner <id>] [--clips 10] [--texts 10]`. Needs DATABASE_URL and JOBS_QUEUE_URL.
import { parseArgs } from "node:util";
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { createDb } from "@ibbun/db";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import { JlptLevel, LearnerId } from "@ibbun/shared";
import { requestLevel } from "./request-level.ts";

const { values } = parseArgs({ options: { level: { type: "string" }, learner: { type: "string" }, clips: { type: "string" }, texts: { type: "string" } } });
const count = (value: string | undefined) => (value === undefined ? undefined : Number.parseInt(value, 10));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 4 });
try {
  const counts = await requestLevel(
    { auth: createAuthoring(db), jobs: createSqsJobsFromEnv(process.env) },
    {
      level: JlptLevel.parse(values.level),
      learnerId: values.learner === undefined ? undefined : LearnerId.parse(values.learner),
      clips: count(values.clips),
      texts: count(values.texts),
    },
  );
  for (const [kind, opened] of Object.entries(counts)) console.log(`${kind}: ${opened} opened`);
} finally {
  await db.$client.end();
}
// The SQS client's open sockets would keep a finished run from exiting.
process.exit(0);
