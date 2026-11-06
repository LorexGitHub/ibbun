import { Hono } from "hono";
import type { ContentGraph } from "@mojibun/content-graph";
import type { CreditsResponse } from "../contract.ts";

/** The public Credits route. Takes the graph lazily, so the API starts without a database until the page is asked for. */
export const creditsApi = (graph: () => Pick<ContentGraph, "credits">) =>
  new Hono().get("/", async (c) => {
    const credits = await graph().credits();
    return c.json<CreditsResponse>({
      credits: credits.map(({ name, licenceName, url, version, appliedAt }) => ({
        name,
        licenceName,
        url,
        version,
        appliedAt: appliedAt?.toISOString() ?? null,
      })),
    });
  });
