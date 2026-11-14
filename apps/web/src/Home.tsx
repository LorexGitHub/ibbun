import { buttonClass } from "@ibbun/ui";
import type { NavEntry } from "@ibbun/slice";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { BlurFade } from "@/vendor/ui/blur-fade";
import { groups } from "./places.ts";

/** What a visitor finds inside, one column per place. */
const Inside = ({ entries }: { entries: NavEntry[] }) => (
  <section className="inside" aria-labelledby="inside-heading">
    <h2 id="inside-heading">What's inside</h2>
    <div className="inside-grid">
      {groups(entries).map((g, column) => (
        <div key={g.place} className="inside-column">
          <h3 className="caps">{g.heading}</h3>
          {g.entries.map((entry, row) => (
            <BlurFade key={entry.path} delay={0.05 * (column + row)}>
              <div className="inside-item">
                <span className="inside-glyph" lang="ja" aria-hidden>
                  {entry.glyph ?? entry.label[0]}
                </span>
                <span>
                  <h4>{entry.label}</h4>
                  <p>{entry.blurb}</p>
                </span>
              </div>
            </BlurFade>
          ))}
        </div>
      ))}
    </div>
  </section>
);

/** A visitor's first screen: the `door` a slice registered as the welcome, or the shell's own line when none did. */
export const Welcome = ({
  entries,
  door,
}: {
  entries: NavEntry[];
  door?: ReactNode;
}) => (
  <>
    {door || (
      <div className="welcome">
        <p className="caps">Japanese, N5 to N1</p>
        <h1>One sentence at a time.</h1>
        <p className="lead">
          Kanji, words, grammar points and listening, studied through spaced
          Reviews of real example sentences. Nothing is locked, so you start
          where you are.
        </p>
        <div className="actions">
          <Link
            className={buttonClass({ variant: "primary", big: true })}
            to="/signup"
          >
            Sign up <span aria-hidden>→</span>
          </Link>
          <Link className={buttonClass({ big: true })} to="/login">
            Log in
          </Link>
        </div>
      </div>
    )}
    <Inside entries={entries} />
  </>
);
