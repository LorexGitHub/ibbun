// `pnpm content:examples` drafts Tatoeba Examples for N5; `pnpm content:examples approve` approves the drafts as the supervisor.
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { createDb } from "@ibbun/db";
import { approveDraftExamples, deriveExamples } from "../sources/examples/index.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 4 });
try {
  const authoring = createAuthoring(db);
  if (process.argv[2] === "approve") console.log(`approved ${await approveDraftExamples({ authoring })} Examples`);
  else {
    const { items, drafted, uncovered } = await deriveExamples({ authoring });
    console.log(`${items} N5 items without an Example: ${drafted} drafted, ${uncovered} found no Sentence`);
  }
} finally {
  await db.$client.end();
}
process.exit(0);
