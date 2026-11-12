import { useSyncExternalStore, type MouseEvent } from "react";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";

// A door opened for one level carries it in its address as `?level=n3`. It is never stored: leaving the screen drops it.
const PARAM = "level";
const CHANGED = "mojibun:level-filter";

/** The level an address's query names, if it names one. */
export const levelIn = (search: string): JlptLevel | undefined => {
  const named = new URLSearchParams(search).get(PARAM)?.toUpperCase();
  return JLPT_LEVELS.find((level) => level === named);
};

/** What a request to a slice's API adds to its address to ask for one level. */
export const levelQuery = (level: JlptLevel | undefined) => (level ? `?${PARAM}=${level}` : "");

const subscribe = (notify: () => void) => {
  window.addEventListener(CHANGED, notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener(CHANGED, notify);
    window.removeEventListener("popstate", notify);
  };
};

/** The level this screen is filtered to, or undefined for all levels. */
export const useLevelFilter = (): JlptLevel | undefined =>
  useSyncExternalStore(
    subscribe,
    () => levelIn(window.location.search),
    () => undefined,
  );

const addressFor = (level: JlptLevel | undefined) => {
  const query = new URLSearchParams(window.location.search);
  query.delete(PARAM);
  if (level) query.set(PARAM, level.toLowerCase());
  return window.location.pathname + (query.size ? `?${query}` : "");
};

const modified = (event: MouseEvent) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/** "All" and the five levels for a screen's top line. The active one is lit; choosing another filters the screen in place. */
export const LevelFilter = () => {
  const active = useLevelFilter();
  const choose = (level: JlptLevel | undefined) => (event: MouseEvent) => {
    if (modified(event)) return;
    event.preventDefault();
    window.history.pushState(window.history.state, "", addressFor(level));
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <nav aria-label="Level filter" className="level-filter">
      {[undefined, ...JLPT_LEVELS].map((level) => (
        <a key={level ?? "all"} href={addressFor(level)} aria-current={level === active ? "true" : undefined} onClick={choose(level)}>
          {level ?? "All"}
        </a>
      ))}
    </nav>
  );
};
