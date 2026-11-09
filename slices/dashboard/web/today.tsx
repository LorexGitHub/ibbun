import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";
import { buttonClass, openGoTo } from "@mojibun/ui";
import { Today } from "../contract.ts";
import { levelNote, pathRows } from "./path.ts";
import "./today.css";

const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "11 kanji, 5 words and 2 grammar points", leaving out the types with none due. */
const dueBreakdown = ({ kanji, word, grammarPoint }: Today["due"]): string => {
  const parts = [kanji ? `${kanji} kanji` : "", word ? plural(word, "word") : "", grammarPoint ? plural(grammarPoint, "grammar point") : ""].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
};

const nextSteps = (dueTotal: number) =>
  dueTotal === 0
    ? [{ href: "/learn", label: "Learn something new" }, { href: "/reviews", label: "Start reviews" }]
    : [{ href: "/reviews", label: "Start reviews" }, { href: "/learn", label: "Learn new" }];

export const TodayHero = ({ today, hour }: { today: Today; hour: number }) => {
  const { due, streakDays } = today;
  // The accent button is the one next step: Reviews while any are due, new items once they're done
  const [primary, secondary] = nextSteps(due.total);
  return (
    <section className="today" aria-labelledby="today-count">
      <p className="caps">
        {greeting(hour)}
        {streakDays > 0 && ` · ${plural(streakDays, "day")} in a row`}
      </p>
      <h1 id="today-count" className="today-count">
        <NumberFlow value={due.total} />
        <span className="visually-hidden"> {due.total === 1 ? "review" : "reviews"} due</span>
      </h1>
      <p className="today-line">{due.total === 0 ? "Nothing waits for you today." : due.total === 1 ? "review waits for you." : "reviews wait for you."}</p>
      <p className="today-breakdown">{due.total === 0 ? "You're all caught up." : `${dueBreakdown(due)}.`}</p>
      <div className="today-actions">
        <a className={buttonClass({ variant: "primary", big: true })} href={primary!.href}>
          {primary!.label} <span aria-hidden>→</span>
        </a>
        <a className={buttonClass({ big: true })} href={secondary!.href}>
          {secondary!.label}
        </a>
      </div>
      <button type="button" className="today-search" onClick={openGoTo}>
        <span lang="ja" aria-hidden>探</span>
        Where to? Reviews, reading, the Library…
        <kbd>Ctrl K</kbd>
      </button>
    </section>
  );
};

export const MasteryByLevel = ({ levels }: { levels: Today["levels"] }) => {
  const rows = pathRows(levels);
  const nowIndex = rows.findIndex((r) => r.stage === "now");
  const now = rows[nowIndex];
  const last = rows.at(-1)?.level;
  const reached = now ? (nowIndex + now.percent / 100) / Math.max(1, rows.length - 1) : 1;
  return (
    <section className="path" aria-labelledby="path-heading">
      <h2 id="path-heading">Your way up to {last}</h2>
      <p>{now ? `You're ${now.percent}% through ${now.level}, and nothing is locked.` : "Every level is settled."}</p>
      <div className="levels-track">
        <span className="levels-line" aria-hidden />
        <span className="levels-fill" aria-hidden style={{ width: `${Math.min(1, reached) * 100}%` }} />
        <ol className="levels">
          {rows.map((row) => (
            <li key={row.level} className={`level ${row.stage}`}>
              <span className="level-dot" aria-hidden />
              <b>{row.level}</b>
              <small>{levelNote(row)}</small>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

type Load = { state: "loading" } | { state: "failed"; loggedOut: boolean } | { state: "ready"; today: Today };

const loadToday = async (): Promise<Load> => {
  const response = await fetch("/api/dashboard/today", { credentials: "same-origin" });
  if (!response.ok) return { state: "failed", loggedOut: response.status === 401 };
  return { state: "ready", today: Today.parse(await response.json()) };
};

/** The dashboard's widget for the home screen: due counts, the streak and Mastery by JLPT Level. */
export const TodayWidget = () => {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    loadToday().then(setLoad, () => setLoad({ state: "failed", loggedOut: false }));
  }, []);
  if (load.state === "loading") return <p role="status">Loading your day…</p>;
  if (load.state === "failed") return <p role="alert">{load.loggedOut ? "Log in to see your day." : "Your day didn't load. Try again in a moment."}</p>;
  return (
    <>
      <TodayHero today={load.today} hour={new Date().getHours()} />
      <MasteryByLevel levels={load.today.levels} />
    </>
  );
};
