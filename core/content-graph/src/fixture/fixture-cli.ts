// `pnpm --filter @ibbun/content-graph seed:fixture`. Needs DATABASE_URL; refused when NODE_ENV=production.
import { createDb } from "@ibbun/db";
import { createAuthoring } from "../authoring/index.ts";
import { loadN5Fixture } from "./load.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 1 });
try {
  console.log(await loadN5Fixture(createAuthoring(db), process.env));
} finally {
  await db.$client.end();
}
