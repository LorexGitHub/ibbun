import type pg from "pg";
import type { Migration } from "./collect.ts";

const LOCK_KEY = 7_340_001;

/**
 * Applies the migrations that have not run yet, in order, each in its own
 * transaction and inside its package's schema. Safe to run twice, and safe to
 * run from two processes at once. Returns the ids it applied.
 */
export const migrate = async (pool: pg.Pool, migrations: Migration[]): Promise<string[]> => {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.ibbun_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    // A database made before the project was called ibbun keeps its record under the old name
    if ((await client.query("SELECT to_regclass('public.mojibun_migrations') AS old")).rows[0].old) {
      await client.query(
        "INSERT INTO public.ibbun_migrations (id, applied_at) SELECT id, applied_at FROM public.mojibun_migrations ON CONFLICT (id) DO NOTHING",
      );
    }
    const done = new Set(
      (await client.query<{ id: string }>("SELECT id FROM public.ibbun_migrations")).rows.map((r) => r.id),
    );
    for (const m of migrations.filter((m) => !done.has(m.id))) {
      await client.query("BEGIN");
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${m.schema}"`);
        await client.query(`SET LOCAL search_path TO "${m.schema}", public`);
        await client.query(m.sql);
        await client.query("INSERT INTO public.ibbun_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${m.id} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(m.id);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return applied;
};
