import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { LevelPage } from "../contract.ts";
import { levelDoors, TRACKS } from "./doors.ts";
import { percentKnown } from "./path.ts";
import "./level.css";

export const LevelView = ({ page }: { page: LevelPage }) => (
  <section className="level-page" aria-labelledby="level-name">
    <p className="caps">JLPT Level</p>
    <h1 id="level-name" className="level-name">
      {page.level}
    </h1>
    <ul className="level-tracks" aria-label="Progress">
      {TRACKS.map(({ label, of }) => {
        const mastery = of(page);
        const percent = percentKnown(mastery);
        return (
          <li key={label}>
            <b>{label}</b>
            <span className="level-bar" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </span>
            <small>
              {mastery.known} of {mastery.total} Known · {percent}%
            </small>
          </li>
        );
      })}
    </ul>
    <nav className="level-doors" aria-label={`Doors at ${page.level}`}>
      {levelDoors(page).map((door) => (
        <Link key={door.label} className="level-door" to={door.href}>
          <span className="jp" lang="ja" aria-hidden>
            {door.glyph}
          </span>
          <b>{door.label}</b>
          <small>{door.note}</small>
        </Link>
      ))}
    </nav>
  </section>
);

type Load = { state: "loading" } | { state: "failed"; status?: number } | { state: "ready"; page: LevelPage };

const loadLevel = async (slug: string): Promise<Load> => {
  const response = await fetch(`/api/dashboard/levels/${slug}`, { credentials: "same-origin" });
  if (!response.ok) return { state: "failed", status: response.status };
  return { state: "ready", page: LevelPage.parse(await response.json()) };
};

const failure = (status: number | undefined, name: string) =>
  status === 404 ? `There is no level ${name}. The levels run from N5 to N1.` : status === 401 ? `Log in to see ${name}.` : `${name} didn't load. Try again in a moment.`;

const LevelLoader = ({ slug }: { slug: string }) => {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const name = slug.toUpperCase();
  useEffect(() => {
    loadLevel(slug).then(setLoad, () => setLoad({ state: "failed" }));
  }, [slug]);
  if (load.state === "loading") return <p role="status">Loading {name}…</p>;
  if (load.state === "ready") return <LevelView page={load.page} />;
  return (
    <div className="level-page">
      <p role="alert">{failure(load.status, name)}</p>
      <Link to="/">Back to Today</Link>
    </div>
  );
};

/** One JLPT Level's own page at `/level/n5`: its name, the progress by type, and its doors. */
export const LevelScreen = () => {
  const { level = "" } = useParams();
  // Keyed by level, so moving from one level to another starts over instead of showing the last one
  return <LevelLoader key={level} slug={level} />;
};
