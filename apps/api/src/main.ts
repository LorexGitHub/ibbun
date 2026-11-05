import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { slices } from "./slices.generated.ts";

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: (await createApp(slices)).fetch, port }, () => console.log(`api listening on :${port}`));
