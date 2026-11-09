import type { CurrentLearner } from "@mojibun/learner/client";
import type { NavEntry, Place } from "@mojibun/slice";

export type Who = { state: "loading" } | { state: "out" } | { state: "in"; learner: CurrentLearner };

/** The app's map. Key order is the order places appear in the bar and the menus. */
export const PLACES: Record<Place, { heading: string; inBar: boolean; onToday: boolean }> = {
  home: { heading: "Today", inBar: true, onToday: false },
  study: { heading: "Study", inBar: false, onToday: true },
  practice: { heading: "Practice", inBar: true, onToday: true },
  library: { heading: "Library", inBar: true, onToday: true },
  account: { heading: "Account", inBar: false, onToday: false },
  supervisor: { heading: "Supervisor", inBar: false, onToday: false },
};

const ORDER = Object.keys(PLACES) as Place[];

const rankOf = (n: NavEntry) => n.rank ?? Number.MAX_SAFE_INTEGER;

const byPlace = (a: NavEntry, b: NavEntry) => ORDER.indexOf(a.place) - ORDER.indexOf(b.place) || rankOf(a) - rankOf(b);

/** Supervisor screens are only on the map for a Supervisor. */
export const visibleTo = (nav: NavEntry[], who: Who): NavEntry[] =>
  nav
    .filter((n) => n.place !== "supervisor" || (who.state === "in" && who.learner.role === "supervisor"))
    .sort(byPlace);

export const barEntries = (nav: NavEntry[]) => nav.filter((n) => PLACES[n.place].inBar);

export const todayEntries = (nav: NavEntry[]) => nav.filter((n) => PLACES[n.place].onToday);

export const entriesAt = (nav: NavEntry[], place: Place) => nav.filter((n) => n.place === place);

export const groups = (nav: NavEntry[]) =>
  ORDER.map((place) => ({ place, heading: PLACES[place].heading, entries: entriesAt(nav, place) })).filter((g) => g.entries.length > 0);

/** The focused session the Learner is in, if the path is one. */
export const sessionAt = (nav: NavEntry[], pathname: string): NavEntry | undefined =>
  nav.find((n) => n.session && (pathname === n.path || pathname.startsWith(`${n.path}/`)));
