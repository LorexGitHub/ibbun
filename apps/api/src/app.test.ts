import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ServerContext } from "@ibbun/slice";
import { createApp } from "./app.ts";

const ctx = {} as ServerContext;

describe("api app", () => {
  it("answers the health check", async () => {
    const app = await createApp([], ctx);
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
  });

  it("hands everything under /api/auth to the auth handler, whatever the method", async () => {
    const seen: string[] = [];
    const app = await createApp([], ctx, {
      authHandler: async (request) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`);
        return Response.json({ handled: true });
      },
    });
    for (const method of ["GET", "POST", "PUT"]) await app.request("/api/auth/preferences", { method });
    expect(seen).toEqual(["GET /api/auth/preferences", "POST /api/auth/preferences", "PUT /api/auth/preferences"]);
  });

  it("has no /api/auth without a handler", async () => {
    expect((await (await createApp([], ctx)).request("/api/auth/get-session")).status).toBe(404);
  });

  it("leaves out the Supervisor slices and Credits in showcase mode only", async () => {
    const slices = ["credits", "import", "learn"].map((name) => ({ name, server: async () => ({ api: new Hono().get("/", (c) => c.text(name)) }) }));
    const status = async (name: string) => (await (await createApp(slices, ctx)).request(`/api/${name}`)).status;
    expect([await status("credits"), await status("import"), await status("learn")]).toEqual([200, 200, 200]);
    vi.stubEnv("SHOWCASE", "1");
    try {
      expect([await status("credits"), await status("import"), await status("learn")]).toEqual([404, 404, 200]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
