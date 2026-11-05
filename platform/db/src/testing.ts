import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";

export type TestPostgres = { url: string; stop: () => Promise<void> };

/**
 * A fresh, empty Postgres database for one test file. With `TEST_DATABASE_URL`
 * set (CI sets it to its Postgres service) it is a new database on that real
 * server, dropped on `stop()`. Without it, an in-process PGlite on a free local
 * port: single connection, so use `max: 1`.
 */
export const startTestPostgres = async (): Promise<TestPostgres> => {
  const server = process.env.TEST_DATABASE_URL;
  return server ? createDatabaseOn(server) : startPglite();
};

const onServer = async (serverUrl: string, statement: string) => {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

const createDatabaseOn = async (serverUrl: string): Promise<TestPostgres> => {
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  await onServer(serverUrl, `CREATE DATABASE "${name}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    stop: () => onServer(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  };
};

const startPglite = async (): Promise<TestPostgres> => {
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port: 0 });
  await server.start();
  const url = `postgres://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
  return {
    url,
    stop: async () => {
      await server.stop();
      await pglite.close();
    },
  };
};
