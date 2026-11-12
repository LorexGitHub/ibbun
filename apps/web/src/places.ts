import type { CurrentLearner } from "@mojibun/learner/client";
import type { NavEntry, Place } from "@mojibun/slice";

export type Who = { state: "loading" } | { state: "out" } | { state: "in"; learner: CurrentLearner };

/** The app's map. Key order is the order places appear in the dock and the menus. */
export const PLACES: Record<Place, { heading: string; inDock: boolean; onWelcome: boolean; byLevel: boolean }> = {
  home: { heading: "Today", inDock: true, onWelcome: false, byLevel: false },
  study: { heading: "Study", inDock: true, onWelcome: true, byLevel: true },
  practice: { heading: "Practice", inDock: true, onWelcome: true, byLevel: true },
  library: { heading: "Library", inDock: true, onWelcome: true, byLevel: false },
  account: { heading: "Account", inDock: false, onWelcome: false, byLevel: false },
  supervisor: { heading: "Supervisor", inDock: false, onWelcome: false, byLevel: false },
};

/** The five JLPT levels, easiest first, each with the numeral that stands for it. */
export const LEVELS = [
  { name: "N5", numeral: "五" },
  { name: "N4", numeral: "四" },
  { name: "N3", numeral: "三" },
  { name: "N2", numeral: "二" },
  { name: "N1", numeral: "一" },
] as const;
export type Level = (typeof LEVELS)[number];

/** What stands behind a screen that has no glyph of its own: the seal's 文. */
const SEAL = "文";

const ORDER = Object.keys(PLACES) as Place[];

const rankOf = (n: NavEntry) => n.rank ?? Number.MAX_SAFE_INTEGER;

const byPlace = (a: NavEntry, b: NavEntry) => ORDER.indexOf(a.place) - ORDER.indexOf(b.place) || rankOf(a) - rankOf(b);

/** Supervisor screens are only on the map for a Supervisor. */
export const visibleTo = (nav: NavEntry[], who: Who): NavEntry[] =>
  nav
    .filter((n) => n.place !== "supervisor" || (who.state === "in" && who.learner.role === "supervisor"))
    .sort(byPlace);

export const dockEntries = (nav: NavEntry[]) => nav.filter((n) => PLACES[n.place].inDock);

export const welcomeEntries = (nav: NavEntry[]) => nav.filter((n) => PLACES[n.place].onWelcome);

export const entriesAt = (nav: NavEntry[], place: Place) => nav.filter((n) => n.place === place);

export const groups = (nav: NavEntry[]) =>
  ORDER.map((place) => ({ place, heading: PLACES[place].heading, entries: entriesAt(nav, place) })).filter((g) => g.entries.length > 0);

const under = (path: string, pathname: string) => pathname === path || pathname.startsWith(`${path}/`);

/** The focused session the Learner is in, if the path is one. */
export const sessionAt = (nav: NavEntry[], pathname: string): NavEntry | undefined => nav.find((n) => n.session && under(n.path, pathname));

const slug = (level: Level) => level.name.toLowerCase();

export const levelPath = (level: Level) => `/level/${slug(level)}`;

export const levelAt = (pathname: string): Level | undefined => LEVELS.find((l) => under(levelPath(l), pathname));

/** A door's address, for one level when one is chosen and the door can be opened for a level. */
export const doorPath = (entry: NavEntry, level?: Level) =>
  level && PLACES[entry.place].byLevel ? `${entry.path}?level=${slug(level)}` : entry.path;

/** Whether the path is a door that can be opened for one level. Only such a door shows the Level filter. */
export const takesLevel = (nav: NavEntry[], pathname: string) => nav.some((n) => n.path !== "/" && PLACES[n.place].byLevel && under(n.path, pathname));

/** The kanji that stands large behind the screen: a level's numeral, the screen's glyph, or 文. Today keeps 文. */
export const kanjiAt = (nav: NavEntry[], pathname: string) => {
  const level = levelAt(pathname);
  if (level) return level.numeral;
  const screen = nav.find((n) => n.glyph && n.path !== "/" && under(n.path, pathname));
  return screen ? screen.glyph : SEAL;
};
