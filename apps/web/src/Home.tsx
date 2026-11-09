import { buttonClass } from "@mojibun/ui";
import type { NavEntry } from "@mojibun/slice";
import { Link } from "react-router";
import { BlurFade } from "@/components/ui/blur-fade";
import { groups } from "./places.ts";

const Tile = ({ entry, linked }: { entry: NavEntry; linked: boolean }) => {
  const body = (
    <>
      <span className="glyph jp" lang="ja" aria-hidden>
        {entry.glyph ?? entry.label[0]}
      </span>
      <h4>{entry.label}</h4>
      <p>{entry.blurb}</p>
    </>
  );
  return linked ? (
    <Link className="tile" to={entry.path}>
      {body}
    </Link>
  ) : (
    <div className="tile">{body}</div>
  );
};

/** Every way into mojibun from Today, one column per place, so a Learner sees the whole map. */
export const Paths = ({ entries, linked, heading }: { entries: NavEntry[]; linked: boolean; heading: string }) => (
  <section className="paths" aria-labelledby="paths-heading">
    <h2 id="paths-heading">{heading}</h2>
    <div className="paths-grid">
      {groups(entries).map((g, column) => (
        <div key={g.place} className="paths-column">
          <h3>{g.heading}</h3>
          {g.entries.map((entry, row) => (
            <BlurFade key={entry.path} delay={0.05 * (column + row)}>
              <Tile entry={entry} linked={linked} />
            </BlurFade>
          ))}
        </div>
      ))}
    </div>
  </section>
);

export const Welcome = ({ entries }: { entries: NavEntry[] }) => (
  <>
    <div className="welcome">
      <h1>Japanese from N5 to N1, one sentence at a time.</h1>
      <p className="lead">
        Kanji, words, grammar points and listening, studied through spaced Reviews of real example sentences. <mark>Nothing is locked</mark>, so you
        start where you are.
      </p>
      <div className="actions">
        <Link className={buttonClass({ variant: "primary", big: true })} to="/signup">
          Sign up
        </Link>
        <Link className={buttonClass({ big: true })} to="/login">
          Log in
        </Link>
      </div>
    </div>
    <Paths entries={entries} linked={false} heading="What's inside" />
  </>
);
