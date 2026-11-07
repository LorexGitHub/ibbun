import { useEffect, useState } from "react";
import { buttonClass, Sheet } from "@mojibun/ui";
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

export const TodayHero = ({ today, hour }: { today: Today; hour: number }) => {
  const { due, streakDays } = today;
  return (
    <div className="hero">
      <div>
        <h1>{due.total === 0 ? `${greeting(hour)}. Nothing is due.` : `${greeting(hour)}. ${plural(due.total, "review")} ${due.total === 1 ? "is" : "are"} waiting.`}</h1>
        <p className="lead">{due.total === 0 ? "You're all caught up." : `${dueBreakdown(due)}.`}</p>
        <div className="actions">
          <a className={buttonClass({ variant: "primary", big: true })} href="/reviews">
            Start reviews
          </a>
          <a className={buttonClass({ big: true })} href="/learn">
            Learn new
          </a>
        </div>
      </div>
      <Sheet tear="sheet" fill="pear">
        <div className="figs">
          <div className="fig">
            <strong>{due.total}</strong>
            <span>due</span>
            <small>by tonight</small>
          </div>
          <div className="fig">
            <strong>{streakDays}</strong>
            <span>{streakDays === 1 ? "day" : "days"}</span>
            <small>in a row</small>
          </div>
        </div>
      </Sheet>
    </div>
  );
};

export const MasteryByLevel = ({ levels }: { levels: Today["levels"] }) => {
  const rows = pathRows(levels);
  const now = rows.find((r) => r.stage === "now");
  const last = rows.at(-1)?.level;
  return (
    <section className="path" aria-labelledby="path-heading">
      <h2 id="path-heading">Your way up to {last}</h2>
      <p>{now ? `You're ${now.percent}% through ${now.level}, and nothing is locked.` : "Every level is settled."}</p>
      <ol className="levels">
        {rows.map((row) => (
          <li key={row.level} className={`level ${row.stage}`}>
            <b>{row.level}</b>
            <small>{levelNote(row)}</small>
          </li>
        ))}
      </ol>
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
