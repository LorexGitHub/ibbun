import { describe, expect, it } from "vitest";
import type { Db } from "@ibbun/db";
import { connectGrammarSeed } from "./connect.ts";

const db = {} as Db;
const env = { DATABASE_URL: "postgres://x", SUDACHI_URL: "http://sudachi.test" };

describe("connectGrammarSeed", () => {
  it("wires Sudachi, the queue and Postgres without connecting to any of them", () => {
    expect(Object.keys(connectGrammarSeed(db, env)).sort()).toEqual(["authoring", "jobs", "nlp", "transact"]);
  });

  it.each(["DATABASE_URL", "SUDACHI_URL"])("fails naming %s when it is missing", (name) => {
    expect(() => connectGrammarSeed(db, { ...env, [name]: undefined })).toThrow(`${name} is not set`);
  });

  it("treats an empty setting as missing", () => {
    expect(() => connectGrammarSeed(db, { ...env, SUDACHI_URL: "" })).toThrow("SUDACHI_URL is not set");
  });
});
