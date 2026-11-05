import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export type Db = NodePgDatabase & { $client: pg.Pool };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** What a core write function accepts: the client, or a transaction a slice opened. */
export type DbOrTx = Db | Tx;

export const createDb = (connectionString: string, options: { max?: number } = {}): Db =>
  drizzle(new pg.Pool({ connectionString, max: options.max ?? 10 }));
