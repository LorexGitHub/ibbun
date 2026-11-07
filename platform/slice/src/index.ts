import type { Hono } from "hono";
import type { ComponentType } from "react";
import type { SessionResolver } from "@mojibun/auth";
import type { Db } from "@mojibun/db";
import type { JobContract, JobHandler } from "@mojibun/jobs";
import type { z } from "zod";

export type NavEntry = { label: string; path: string };
export type WebRoute = { path: string; component: ComponentType };
/** A piece of UI a slice offers to a screen that another slice (or the shell) owns, such as the dashboard. */
export type Widget = { slot: string; component: ComponentType };

/** A job a slice wants started on a cron schedule (UTC), with no human involved. */
export type Schedule<S extends z.ZodType = z.ZodType> = { contract: JobContract<S>; cron: string; payload: z.input<S> };

/** What the api and worker shells hand every slice's server part: the database and who is asking. */
export type ServerContext = { db: Db; sessions: SessionResolver };

export type ServerPart = {
  /** Mounted by apps/api at `/api/<slice name>`. */
  api?: Hono;
  /** Run by apps/worker. */
  jobs?: JobHandler[];
  /** Started by apps/worker on their cron times. */
  schedules?: Schedule[];
};
export type WebPart = { routes?: WebRoute[]; widgets?: Widget[] };

/**
 * What a slice's `register.ts` default-exports. It is plain data: the server and web
 * parts load lazily, so Node never loads React code and the browser never needs Hono.
 */
export type Slice = {
  name: string;
  nav?: NavEntry;
  server?: (ctx: ServerContext) => Promise<ServerPart>;
  web?: () => Promise<WebPart>;
};

const NAME = /^[a-z][a-z0-9-]*$/;

export const defineSlice = (slice: Slice): Slice => {
  if (!NAME.test(slice.name)) throw new Error(`slice name "${slice.name}" must be lower-case letters, digits and dashes`);
  return slice;
};

/** Sorts by name and rejects two slices that claim the same name. */
export const checkSlices = (slices: Slice[]): Slice[] => {
  const names = new Set<string>();
  for (const { name } of slices) {
    if (names.has(name)) throw new Error(`two slices are called "${name}"`);
    names.add(name);
  }
  return [...slices].sort((a, b) => a.name.localeCompare(b.name));
};

export const loadServerParts = async (
  slices: Slice[],
  ctx: ServerContext,
): Promise<{ slice: Slice; part: ServerPart }[]> =>
  Promise.all(slices.map(async (slice) => ({ slice, part: (await slice.server?.(ctx)) ?? {} })));
