import { Hono } from "hono";
import { createReadingApi } from "./api.ts";
import { productionDeps } from "./production.ts";

const MOUNT = /^\/api\/reading(?=\/|$)/;

type Fetchable = { fetch: (request: Request) => Response | Promise<Response> };

/**
 * Builds `make()` on the first request, and hands every request to it with the `/api/reading` mount
 * taken off, so the worker, which loads every slice for its jobs, never needs the web environment.
 */
export const lazyApi = (make: () => Fetchable) => {
  let built: Fetchable | undefined;
  return new Hono().all("*", (c) => {
    const app = (built ??= make());
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(MOUNT, "") || "/";
    return app.fetch(new Request(url, c.req.raw));
  });
};

/** The API apps/api mounts at `/api/reading`. */
export const api = lazyApi(() => createReadingApi(productionDeps(process.env)));
