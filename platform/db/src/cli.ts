import { resolve } from "node:path";
import { createDb } from "./client.ts";
import { collectMigrations, workspacePackageDirs } from "./collect.ts";
import { migrate } from "./migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const root = resolve(import.meta.dirname, "../../..");
const db = createDb(url, { max: 2 });
try {
  const applied = await migrate(db.$client, await collectMigrations(await workspacePackageDirs(root)));
  console.log(applied.length ? `applied:\n${applied.join("\n")}` : "database is up to date");
} finally {
  await db.$client.end();
}
