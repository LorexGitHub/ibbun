import { describe, expect, it, vi } from "vitest";
import { lazyApi } from "../server/listening-mount.ts";
import { productionDeps } from "../server/production.ts";

describe("lazyApi", () => {
  const request = (app: ReturnType<typeof lazyApi>, path: string) => app.request(path);

  it("builds the API on the first request only, and takes the /api/listening mount off the path", async () => {
    const seen: string[] = [];
    const make = vi.fn(() => ({ fetch: (r: Request) => (seen.push(new URL(r.url).pathname), new Response("ok")) }));
    const app = lazyApi(make);
    expect(make).not.toHaveBeenCalled();
    await request(app, "/api/listening/clips?level=N5");
    await request(app, "/api/listening");
    await request(app, "/api/listening-other/x");
    expect(make).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["/clips", "/", "/api/listening-other/x"]);
  });
});

describe("productionDeps", () => {
  it("refuses to start without a database", () => {
    expect(() => productionDeps({})).toThrow("DATABASE_URL is not set");
  });

  it("wires every core dependency without connecting until a request needs the database", () => {
    const env = { DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", AUTH_SECRET: "x".repeat(32), APP_URL: "http://localhost:5173" };
    const deps = productionDeps(env);
    expect(Object.keys(deps).sort()).toEqual(["contentGraph", "guards", "jobs", "learners", "now", "practiceLimit", "progress", "random", "texts"]);
    expect(deps.now()).toBeInstanceOf(Date);
    expect(deps.random()).toBeLessThan(1);
  });
});
