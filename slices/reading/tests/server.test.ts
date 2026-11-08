import { describe, expect, it, vi } from "vitest";
import { lazyApi } from "../server/mount.ts";
import { productionDeps } from "../server/production.ts";

describe("lazyApi", () => {
  const request = (app: ReturnType<typeof lazyApi>, path: string) => app.request(path);

  it("builds the API on the first request only, and takes the /api/reading mount off the path", async () => {
    const seen: string[] = [];
    const make = vi.fn(() => ({ fetch: (r: Request) => (seen.push(new URL(r.url).pathname), new Response("ok")) }));
    const app = lazyApi(make);
    expect(make).not.toHaveBeenCalled();
    await request(app, "/api/reading/episodes");
    await request(app, "/api/reading");
    await request(app, "/api/reading-other/x");
    expect(make).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["/episodes", "/", "/api/reading-other/x"]);
  });
});

describe("productionDeps", () => {
  it("refuses to start without a database", () => {
    expect(() => productionDeps({})).toThrow("DATABASE_URL is not set");
  });

  it("wires every core dependency without connecting until a request needs the database", () => {
    const env = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", AUTH_SECRET: "x".repeat(32), APP_URL: "http://localhost:5173" };
    const deps = productionDeps(env);
    expect(Object.keys(deps).sort()).toEqual(["contentGraph", "guards", "learners", "now", "practice", "progress", "texts"]);
    expect(deps.now()).toBeInstanceOf(Date);
  });

  it("limits Practice Texts to 5 a day, waiting up to 20 s", async () => {
    const env = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", AUTH_SECRET: "x".repeat(32), APP_URL: "http://localhost:5173" };
    expect(productionDeps(env).practice.config).toEqual({ dailyLimit: 5, waitMs: 20_000, pollMs: 1_000 });
    const { practice } = productionDeps(env);
    await practice.sleep(1);
    expect(practice.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
