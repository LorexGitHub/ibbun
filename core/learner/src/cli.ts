// `pnpm --filter @mojibun/learner seed` and `... grant-supervisor <email>`. Needs DATABASE_URL.
import { createDb } from "@mojibun/db";
import { consoleAuthLog } from "./events.ts";
import { createLearners } from "./learners.ts";
import { grantSupervisor, seedAccounts } from "./seed.ts";

const [command, email] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 1 });
const learners = createLearners(db, consoleAuthLog);
try {
  if (command === "seed") console.log((await seedAccounts(db, learners, process.env)).join("\n"));
  else if (command === "grant-supervisor" && email) await grantSupervisor(learners, email);
  else throw new Error("usage: cli.ts seed | cli.ts grant-supervisor <email>");
} finally {
  await db.$client.end();
}
