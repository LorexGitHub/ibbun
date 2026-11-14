import { Hono } from "hono";
import { isShowcase, SHOWCASE_OFF_SLICES } from "@ibbun/shared";
import { checkSlices, loadServerParts, type ServerContext, type Slice } from "@ibbun/slice";

export type AppOptions = {
  /** Core `learner`'s `authHandler`: mounted at `/api/auth/*`. */
  authHandler?: (request: Request) => Promise<Response>;
};

/** The HTTP API: `/api/health`, auth at `/api/auth/*`, plus each slice's routes under `/api/<slice name>`. */
export const createApp = async (slices: Slice[], ctx: ServerContext, { authHandler }: AppOptions = {}): Promise<Hono> => {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  if (authHandler) app.on(["GET", "POST", "PUT"], "/api/auth/*", (c) => authHandler(c.req.raw));
  const served = isShowcase(process.env.SHOWCASE) ? slices.filter((s) => !SHOWCASE_OFF_SLICES.includes(s.name)) : slices;
  for (const { slice, part } of await loadServerParts(checkSlices(served), ctx)) {
    if (part.api) app.route(`/api/${slice.name}`, part.api);
  }
  return app;
};
