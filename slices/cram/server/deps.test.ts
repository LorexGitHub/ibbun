import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { dependenciesFromEnv } from "./deps.ts";

let pg: TestPostgres;
beforeAll(async () => {
  pg = await startTestPostgres();
}, 60_000);
afterAll(() => pg.stop());

const env = () => ({
  DATABASE_URL: pg.url,
  SMTP_URL: "smtp://localhost:1025",
  AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:5173",
});

describe("dependenciesFromEnv", () => {
  it("builds core's interfaces and a resolver that finds no session in a request without a cookie", async () => {
    const deps = await dependenciesFromEnv(env());
    expect(await deps.sessions.resolve(new Headers())).toBeNull();
    expect(typeof deps.contentGraph.levelList).toBe("function");
    expect(typeof deps.progress.record).toBe("function");
    expect(deps.now()).toBeInstanceOf(Date);
  });

  it("names what is missing", async () => {
    await expect(dependenciesFromEnv({})).rejects.toThrow("DATABASE_URL is not set");
    await expect(dependenciesFromEnv({ DATABASE_URL: pg.url })).rejects.toThrow("SMTP_URL is not set");
    await expect(dependenciesFromEnv({ DATABASE_URL: pg.url, SMTP_URL: "smtp://x" })).rejects.toThrow("AUTH_SECRET is not set");
  });
});
