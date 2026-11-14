import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONNECT_TIMEOUT_MS, type TokenSigner } from "./client.ts";
import { collectMigrations, createDb, migrate, parseMigrationFile, transaction, type Db } from "./index.ts";
import { startTestPostgres, type TestPostgres } from "./testing.ts";

const writePackage = async (root: string, group: string, name: string, files: Record<string, string>) => {
  const dir = join(root, group, name);
  await mkdir(join(dir, "db", "migrations"), { recursive: true });
  for (const [file, sql] of Object.entries(files)) await writeFile(join(dir, "db", "migrations", file), sql);
  return dir;
};

describe("collectMigrations", () => {
  it("orders migrations from every package by timestamp, whatever the package", async () => {
    const root = await mkdtemp(join(tmpdir(), "mig-"));
    const a = await writePackage(root, "core", "progress", {
      "20260102000000_second.sql": "select 2",
      "20260104000000_fourth.sql": "select 4",
    });
    const b = await writePackage(root, "slices", "cram", {
      "20260101000000_first.sql": "select 1",
      "20260103000000_third.sql": "select 3",
    });
    const ordered = await collectMigrations([a, b]);
    expect(ordered.map((m) => m.id)).toEqual([
      "cram/20260101000000_first.sql",
      "progress/20260102000000_second.sql",
      "cram/20260103000000_third.sql",
      "progress/20260104000000_fourth.sql",
    ]);
  });

  it("ignores a package with no migrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "mig-"));
    await mkdir(join(root, "slices", "empty"), { recursive: true });
    expect(await collectMigrations([join(root, "slices", "empty")])).toEqual([]);
  });

  it("maps a package directory to a Postgres schema name", () => {
    expect(parseMigrationFile("/x/core/content-graph", "20260101000000_init.sql", "").schema).toBe("content_graph");
  });

  it("rejects a migration without a timestamp prefix", () => {
    expect(() => parseMigrationFile("/x/core/progress", "init.sql", "")).toThrow(/YYYYMMDDHHmmss/);
  });
});

const isolated = async (first: TestPostgres, second: TestPostgres) => {
  const a = createDb(first.url, { max: 1 });
  const b = createDb(second.url, { max: 1 });
  try {
    await a.$client.query("CREATE TABLE only_in_first (n int)");
    const { rows } = await b.$client.query("SELECT to_regclass('only_in_first') AS t");
    return rows[0].t === null;
  } finally {
    await a.$client.end();
    await b.$client.end();
  }
};

const reachable = async (url: string) => {
  const db = createDb(url, { max: 1 });
  try {
    await db.$client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await db.$client.end();
  }
};

describe("startTestPostgres", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("without TEST_DATABASE_URL, starts an in-process Postgres per caller, gone after stop", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    const first = await startTestPostgres();
    const second = await startTestPostgres();
    expect(await isolated(first, second)).toBe(true);
    await first.stop();
    await second.stop();
    expect(await reachable(first.url)).toBe(false);
  });

  it.runIf(process.env.TEST_DATABASE_URL)(
    "with TEST_DATABASE_URL, creates a fresh database per caller on that server, dropped after stop",
    async () => {
      const first = await startTestPostgres();
      const second = await startTestPostgres();
      expect(new URL(first.url).host).toBe(new URL(process.env.TEST_DATABASE_URL!).host);
      expect(await isolated(first, second)).toBe(true);
      await first.stop();
      await second.stop();
      expect(await reachable(first.url)).toBe(false);
      expect(await reachable(process.env.TEST_DATABASE_URL!)).toBe(true);
    },
  );
});

describe("migrate and transaction, against Postgres", () => {
  let pg: Awaited<ReturnType<typeof startTestPostgres>>;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });

  const migration = (id: string, schema: string, sql: string) => ({ id, schema, timestamp: "0", sql });

  it("creates one schema per package and puts the package's tables in it", async () => {
    const applied = await migrate(db.$client, [
      migration("progress/1.sql", "progress", "CREATE TABLE reviews (id int)"),
      migration("cram/1.sql", "cram", "CREATE TABLE reviews (id int)"),
    ]);
    expect(applied).toEqual(["progress/1.sql", "cram/1.sql"]);
    const { rows } = await db.$client.query(
      "SELECT table_schema FROM information_schema.tables WHERE table_name = 'reviews' ORDER BY 1",
    );
    expect(rows.map((r) => r.table_schema)).toEqual(["cram", "progress"]);
  });

  it("counts a migration recorded under the project's old name as applied", async () => {
    await db.$client.query("CREATE TABLE public.mojibun_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await db.$client.query("INSERT INTO public.mojibun_migrations (id) VALUES ('old/1.sql')");
    const m = migration("old/1.sql", "old", "CREATE TABLE never (id int)");
    expect(await migrate(db.$client, [m, migration("old/2.sql", "old", "CREATE TABLE fresh (id int)")])).toEqual(["old/2.sql"]);
    expect(await migrate(db.$client, [m])).toEqual([]);
    await db.$client.query("DROP TABLE public.mojibun_migrations");
  });

  it("applies nothing the second time", async () => {
    const m = migration("learner/1.sql", "learner", "CREATE TABLE accounts (id int)");
    expect(await migrate(db.$client, [m])).toEqual(["learner/1.sql"]);
    expect(await migrate(db.$client, [m])).toEqual([]);
  });

  it("rolls a failed migration back completely and names it", async () => {
    const bad = migration("broken/1.sql", "broken", "CREATE TABLE half (id int); SELECT nope");
    await expect(migrate(db.$client, [bad])).rejects.toThrow(/broken\/1\.sql/);
    const { rows } = await db.$client.query("SELECT to_regclass('broken.half') AS t");
    expect(rows[0].t).toBeNull();
    expect(await migrate(db.$client, [migration("broken/1.sql", "broken", "CREATE TABLE half (id int)")])).toEqual([
      "broken/1.sql",
    ]);
  });

  it("commits a transaction that resolves and rolls back one that throws", async () => {
    await db.$client.query("CREATE TABLE tx_probe (n int)");
    await transaction(db, (tx) => tx.execute(sql`INSERT INTO tx_probe VALUES (1)`));
    await expect(
      transaction(db, async (tx) => {
        await tx.execute(sql`INSERT INTO tx_probe VALUES (2)`);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    const { rows } = await db.$client.query("SELECT n FROM tx_probe");
    expect(rows).toEqual([{ n: 1 }]);
  });
});

describe("createDb", () => {
  afterEach(() => vi.unstubAllEnvs());

  const poolOptions = (db: Db) => db.$client.options as typeof db.$client.options & { password?: unknown };

  it("with an IAM region, signs a fresh token for every new connection and verifies TLS against the RDS CA", async () => {
    const targets: unknown[] = [];
    const signer: TokenSigner = async (target) => {
      targets.push(target);
      return `token-${targets.length}`;
    };
    const db = createDb("postgres://ibbun_app@cluster.example.eu-central-1.rds.amazonaws.com:5432/ibbun", {
      iamRegion: "eu-central-1",
      signer,
    });
    const password = poolOptions(db).password as () => Promise<string>;
    expect(await password()).toBe("token-1");
    expect(await password()).toBe("token-2");
    expect(targets[0]).toEqual({
      hostname: "cluster.example.eu-central-1.rds.amazonaws.com",
      port: 5432,
      username: "ibbun_app",
      region: "eu-central-1",
    });
    const ssl = poolOptions(db).ssl as { ca: string; rejectUnauthorized: boolean };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toContain("BEGIN CERTIFICATE");
    await db.$client.end();
  });

  it("takes the IAM region from DATABASE_IAM_REGION", async () => {
    vi.stubEnv("DATABASE_IAM_REGION", "eu-central-1");
    const targets: { port: number }[] = [];
    const db = createDb("postgres://ibbun_app@h/ibbun", { signer: async (target) => (targets.push(target), "t") });
    expect(await (poolOptions(db).password as () => Promise<string>)()).toBe("t");
    expect(targets[0]!.port).toBe(5432);
    const off = createDb("postgres://ibbun:ibbun@h/ibbun", { iamRegion: "" });
    expect(poolOptions(off).password).toBeUndefined();
    await Promise.all([db.$client.end(), off.$client.end()]);
  });

  it("without an IAM region, signs no token and keeps the URL's own password and TLS settings", async () => {
    vi.stubEnv("DATABASE_IAM_REGION", "");
    const db = createDb("postgres://ibbun:ibbun@localhost:5432/ibbun");
    expect(poolOptions(db).password).toBeUndefined();
    expect(poolOptions(db).ssl).toBeFalsy();
    await db.$client.end();
  });

  it("waits long enough for a paused Aurora to resume", async () => {
    const db = createDb("postgres://ibbun:ibbun@localhost/ibbun");
    expect(db.$client.options.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_MS);
    expect(CONNECT_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    await db.$client.end();
  });

  it("sizes the pool from DATABASE_POOL_MAX, an explicit max winning", async () => {
    vi.stubEnv("DATABASE_POOL_MAX", "1");
    const fromEnv = createDb("postgres://x:x@localhost/x");
    const explicit = createDb("postgres://x:x@localhost/x", { max: 2 });
    expect([fromEnv.$client.options.max, explicit.$client.options.max]).toEqual([1, 2]);
    await Promise.all([fromEnv.$client.end(), explicit.$client.end()]);
    expect(() => createDb("postgres://x:x@localhost/x", { max: 0 })).toThrow(/positive integer/);
    vi.stubEnv("DATABASE_POOL_MAX", "0");
    expect(() => createDb("postgres://x:x@localhost/x")).toThrow(/DATABASE_POOL_MAX/);
  });

  it("defaults the pool to 10", async () => {
    vi.stubEnv("DATABASE_POOL_MAX", "");
    const db = createDb("postgres://x:x@localhost/x");
    expect(db.$client.options.max).toBe(10);
    await db.$client.end();
  });
});

describe("the app role", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });

  const asApp = async (statement: string) => {
    await db.$client.query("SET ROLE ibbun_app");
    try {
      return await db.$client.query(statement);
    } finally {
      await db.$client.query("RESET ROLE");
    }
  };

  it("reads and writes tables made before and after the grants, and cannot change the schema", async () => {
    const grants = await readFile(new URL("../db/migrations/20261113120000_app_role.sql", import.meta.url), "utf8");
    const m = (id: string, schema: string, sql: string) => ({ id, schema, timestamp: "0", sql });
    await migrate(db.$client, [
      m("progress/1.sql", "progress", "CREATE TABLE before (id serial PRIMARY KEY, n int)"),
      m("db/app_role.sql", "db", grants),
      m("cram/1.sql", "cram", "CREATE TABLE after (id serial PRIMARY KEY, n int)"),
    ]);
    await asApp("INSERT INTO progress.before (n) VALUES (1)");
    await asApp("INSERT INTO cram.after (n) VALUES (2)");
    await asApp("UPDATE cram.after SET n = 3");
    expect((await asApp("SELECT n FROM cram.after")).rows).toEqual([{ n: 3 }]);
    await asApp("DELETE FROM progress.before");
    await expect(asApp("CREATE TABLE progress.sneaky (n int)")).rejects.toThrow(/permission denied/);
    await expect(asApp("DROP TABLE cram.after")).rejects.toThrow(/must be owner/);
    await expect(asApp("SELECT * FROM public.ibbun_migrations")).rejects.toThrow(/permission denied/);
  });
});
