import type { Hono } from "hono";
import type { ComponentType } from "react";
import type { SessionResolver } from "@mojibun/auth";
import type { Db } from "@mojibun/db";
import type { JobHandler } from "@mojibun/jobs";

/**
 * Where a destination sits on the app's map, which decides how a Learner finds it:
 * `home`, `library` and `practice` are in the top bar; `study` is reached from Today;
 * `account` and `supervisor` sit in the account menu. Every place is in the command menu.
 */
export type Place = "home" | "study" | "practice" | "library" | "account" | "supervisor";

export type NavEntry = {
  label: string;
  path: string;
  place: Place;
  /** One line on what the Learner does there, shown on Today and in the command menu. */
  blurb: string;
  /** Lower comes first within its place. Entries without one follow, by slice name. */
  rank?: number;
  /** A Japanese character that stands for the destination, in place of an icon. */
  glyph?: string;
  /** A focused session (a Review, a lesson): the bar swaps the map for a way back to Today. */
  session?: boolean;
};
export type WebRoute = { path: string; component: ComponentType };
/** A piece of UI a slice offers to a screen that another slice (or the shell) owns, such as the dashboard. */
export type Widget = { slot: string; component: ComponentType };

/** What the api and worker shells hand every slice's server part: the database and who is asking. */
export type ServerContext = { db: Db; sessions: SessionResolver };

export type ServerPart = {
  /** Mounted by apps/api at `/api/<slice name>`. */
  api?: Hono;
  /** Run by apps/worker. */
  jobs?: JobHandler[];
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
