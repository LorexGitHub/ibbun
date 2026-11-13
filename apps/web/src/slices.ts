import { checkSlices, type NavEntry, type Slice, type Widget, type WebRoute } from "@ibbun/slice";

export type Shell = { nav: NavEntry[]; routes: WebRoute[]; widgets: Widget[] };

/** Turns a Vite glob of `register.ts` modules into slices. */
export const discoverSlices = (modules: Record<string, { default: Slice }>): Slice[] =>
  checkSlices(Object.values(modules).map((m) => m.default));

/** Loads every slice's web part and gathers what the shell shows. */
export const buildShell = async (slices: Slice[]): Promise<Shell> => {
  const parts = await Promise.all(slices.map(async (s) => (await s.web?.()) ?? {}));
  return {
    nav: slices.flatMap((s) => (s.nav ? [s.nav] : [])),
    routes: parts.flatMap((p) => p.routes ?? []),
    widgets: parts.flatMap((p) => p.widgets ?? []),
  };
};
