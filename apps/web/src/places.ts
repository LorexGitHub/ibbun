import type { CurrentLearner } from "@mojibun/learner/client";
import type { NavEntry, Place } from "@mojibun/slice";

export type Who = { state: "loading" } | { state: "out" } | { state: "in"; learner: CurrentLearner };

/** The app's map. Key order is the order places appear in the dock and the menus. */
export const PLACES: Record<Place, { heading: string; inDock: boolean; onWelcome: boolean }> = {
  home: { heading: "Today", inDock: true, onWelcome: false },
  study: { heading: "Study", inDock: true, onWelcome: true },
  practice: { heading: "Practice", inDock: true, onWelcome: true },
  library: { heading: "Library", inDock: true, onWelcome: true },
  account: { heading: "Account", inDock: false, onWelcome: false },
  supervisor: { heading: "Supervisor", inDock: false, onWelcome: false },
};

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

/** The focused session the Learner is in, if the path is one. */
export const sessionAt = (nav: NavEntry[], pathname: string): NavEntry | undefined =>
  nav.find((n) => n.session && (pathname === n.path || pathname.startsWith(`${n.path}/`)));
