import type { Hono } from "hono";
import type { ComponentType } from "react";
import type { JobHandler } from "@mojibun/jobs";

export type NavEntry = { label: string; path: string };
export type WebRoute = { path: string; component: ComponentType };
/** A piece of UI a slice offers to a screen that another slice (or the shell) owns, such as the dashboard. */
export type Widget = { slot: string; component: ComponentType };

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
  server?: () => Promise<ServerPart>;
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

export const loadServerParts = async (slices: Slice[]): Promise<{ slice: Slice; part: ServerPart }[]> =>
  Promise.all(slices.map(async (slice) => ({ slice, part: (await slice.server?.()) ?? {} })));
