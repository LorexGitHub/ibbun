import { readFileSync } from "node:fs";
import { Signer } from "@aws-sdk/rds-signer";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export type Db = NodePgDatabase & { $client: pg.Pool };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** What a core write function accepts: the client, or a transaction a slice opened. */
export type DbOrTx = Db | Tx;

/** Signs a 15-minute IAM auth token for one Aurora user. */
export type TokenSigner = (target: { hostname: string; port: number; username: string; region: string }) => Promise<string>;

export type DbOptions = {
  /** Pool size. Defaults to `DATABASE_POOL_MAX`, else 10. Lambdas set 1 or 2. */
  max?: number;
  /** AWS region of an Aurora cluster reached with IAM auth. Defaults to `DATABASE_IAM_REGION`; unset means a plain password. */
  iamRegion?: string;
  signer?: TokenSigner;
};

// A paused Aurora Serverless v2 takes about 15 s to accept a connection.
export const CONNECT_TIMEOUT_MS = 30_000;

const awsSigner: TokenSigner = (target) => new Signer(target).getAuthToken();

const rdsCa = () => readFileSync(new URL("../certs/rds-global-bundle.pem", import.meta.url), "utf8");

const poolMax = (value: string | number) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`DATABASE_POOL_MAX must be a positive integer, got "${value}"`);
  return n;
};

const iamAuth = (connectionString: string, region: string, sign: TokenSigner): pg.PoolConfig => {
  const url = new URL(connectionString);
  const target = {
    hostname: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    region,
  };
  return { password: () => sign(target), ssl: { ca: rdsCa(), rejectUnauthorized: true } };
};

export const createDb = (connectionString: string, { signer = awsSigner, ...options }: DbOptions = {}): Db => {
  const env = process.env;
  const max = poolMax(options.max ?? (env.DATABASE_POOL_MAX || 10));
  // An explicit empty region turns IAM off even where DATABASE_IAM_REGION is set.
  const region = options.iamRegion ?? env.DATABASE_IAM_REGION;
  return drizzle(
    new pg.Pool({
      connectionString,
      max,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      ...(region ? iamAuth(connectionString, region, signer) : {}),
    }),
  );
};
