import { Hono } from "hono";
import { checkSlices, loadServerParts, type Slice } from "@mojibun/slice";

/** The HTTP API: `/api/health`, plus each slice's routes under `/api/<slice name>`. */
export const createApp = async (slices: Slice[]): Promise<Hono> => {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  for (const { slice, part } of await loadServerParts(checkSlices(slices))) {
    if (part.api) app.route(`/api/${slice.name}`, part.api);
  }
  return app;
};
