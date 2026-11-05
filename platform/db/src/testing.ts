import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/** An in-process Postgres on a free local port, for tests. Single connection, so use `max: 1`. */
export const startTestPostgres = async (): Promise<{ url: string; stop: () => Promise<void> }> => {
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
