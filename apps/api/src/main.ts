import { serve } from "@hono/node-server";
import { createApi } from "./api.ts";

// Local runs need no auth setup; production must set AUTH_SECRET and APP_URL.
const devAuth = { AUTH_SECRET: "dev-only-secret-not-for-production-use", APP_URL: "http://localhost:5173" };
const env = process.env.NODE_ENV === "production" ? process.env : { ...devAuth, ...process.env };

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: (await createApi(env)).fetch, port }, () => console.log(`api listening on :${port}`));
