import { Hono } from "hono";
import { createCramApi } from "./api.ts";
import { dependenciesFromEnv } from "./deps.ts";

/** Mounted at `/api/cram`. Wrapped in a plain Hono so the shell sees a route table, not Cram's auth variables. */
export const api = new Hono().route("/", createCramApi(() => dependenciesFromEnv(process.env)));
