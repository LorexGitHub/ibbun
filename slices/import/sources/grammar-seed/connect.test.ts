import { describe, expect, it } from "vitest";
import type { Db } from "@ibbun/db";
import { connectGrammarSeed } from "./connect.ts";

const db = {} as Db;
const env = { SUDACHI_URL: "http://sudachi.test" };

describe("connectGrammarSeed", () => {
  it("wires Sudachi, the queue and Postgres without connecting to any of them", () => {
    expect(Object.keys(connectGrammarSeed(db, env)).sort()).toEqual(["authoring", "jobs", "nlp", "transact"]);
  });

  it("fails naming SUDACHI_URL when it is missing", () => {
    expect(() => connectGrammarSeed(db, {})).toThrow("SUDACHI_URL is not set");
  });

  it("treats an empty setting as missing", () => {
    expect(() => connectGrammarSeed(db, { ...env, SUDACHI_URL: "" })).toThrow("SUDACHI_URL is not set");
  });
});
