import { createContentGraph, type ContentGraph } from "@ibbun/content-graph";
import { createDb } from "@ibbun/db";
import { creditsApi } from "./credits-api.ts";

let graph: ContentGraph | undefined;

export const liveGraph = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (graph ??= createContentGraph(createDb(url, { max: 2 })));
};

export const api = creditsApi(liveGraph);
