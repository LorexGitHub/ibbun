import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@ibbun/db";
import { tables, type Graph } from "../graph.ts";

export type TableName = keyof Graph;
export type Row<N extends TableName> = Graph[N][number];
export type Where<N extends TableName> = Partial<Row<N>>;

/** Row access the authoring rules are written against, once, for Postgres and for memory. */
export type Store = {
  rows<N extends TableName>(name: N, where?: Where<N>): Promise<Row<N>[]>;
  insert<N extends TableName>(name: N, rows: Row<N>[]): Promise<void>;
  update<N extends TableName>(name: N, where: Where<N>, patch: Partial<Row<N>>): Promise<void>;
  /** Conditional update: patches the rows that match, in one statement. Returns whether any did. */
  claim<N extends TableName>(name: N, where: Where<N>, patch: Partial<Row<N>>): Promise<boolean>;
  /** Hard delete. Only for derived links, which are a cache (docs/adr/0004). */
  remove<N extends TableName>(name: N, where: Where<N>): Promise<void>;
  /** Hard delete of many rows by id, in one statement. Only for derived links. */
  removeByIds<N extends TableName>(name: N, ids: string[]): Promise<void>;
  atomically<T>(work: (store: Store) => Promise<T>): Promise<T>;
};

const matches = (row: object, where: object) =>
  Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value);

export const memoryStore = (graph: Graph): Store => {
  const store: Store = {
    rows: async (name, where = {}) => graph[name].filter((row) => matches(row, where)).map((row) => structuredClone(row)) as never,
    insert: async (name, rows) => {
      (graph[name] as object[]).push(...structuredClone(rows));
    },
    update: async (name, where, patch) => {
      for (const row of graph[name]) if (matches(row, where)) Object.assign(row, patch);
    },
    claim: async (name, where, patch) => {
      const hit = graph[name].filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, patch);
      return hit.length > 0;
    },
    remove: async (name, where) => {
      const rows = graph[name] as object[];
      const kept = rows.filter((row) => !matches(row, where));
      rows.splice(0, rows.length, ...kept);
    },
    removeByIds: async (name, ids) => {
      const rows = graph[name] as unknown as { id: string }[];
      for (let at = rows.length - 1; at >= 0; at--) if (ids.includes(rows[at]!.id)) rows.splice(at, 1);
    },
    atomically: async (work) => {
      const before = structuredClone(graph);
      try {
        return await work(store);
      } catch (error) {
        Object.assign(graph, before);
        throw error;
      }
    },
  };
  return store;
};

const condition = (name: TableName, where: object): SQL | undefined => {
  const columns = tables[name] as unknown as Record<string, PgColumn>;
  return and(...Object.entries(where).map(([key, value]) => (value === null ? isNull(columns[key]!) : eq(columns[key]!, value))));
};

const table = (name: TableName) => tables[name] as PgTable;

export const postgresStore = (db: DbOrTx): Store => ({
  rows: async (name, where = {}) => (await db.select().from(table(name)).where(condition(name, where))) as never,
  insert: async (name, rows) => {
    if (rows.length) await db.insert(table(name)).values(rows as never);
  },
  update: async (name, where, patch) => {
    await db.update(table(name)).set(patch as never).where(condition(name, where));
  },
  claim: async (name, where, patch) => {
    const { id } = tables[name] as unknown as { id: PgColumn };
    const hit = await db.update(table(name)).set(patch as never).where(condition(name, where)).returning({ id });
    return hit.length > 0;
  },
  remove: async (name, where) => {
    await db.delete(table(name)).where(condition(name, where));
  },
  removeByIds: async (name, ids) => {
    const { id } = tables[name] as unknown as { id: PgColumn };
    if (ids.length) await db.delete(table(name)).where(inArray(id, ids));
  },
  atomically: (work) => db.transaction((tx) => work(postgresStore(tx))),
});
