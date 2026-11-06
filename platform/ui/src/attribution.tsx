import { Fragment } from "react";

/**
 * EDRDG's sample acknowledgement (docs/licensing.md#where-attribution-appears, item 1).
 * Shown on every Learner screen, so it lives in the Layout and no screen decides it.
 */
export const Footer = ({ creditsHref = "/credits" }: { creditsHref?: string }) => (
  <footer className="app-footer">
    <div className="wrap">
      <p>
        This app uses the <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</a>,{" "}
        <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a> and{" "}
        <a href="https://www.edrdg.org/krad/kradinf.html">KRADFILE</a> dictionary files. These files are the property of the{" "}
        <a href="https://www.edrdg.org/">Electronic Dictionary Research and Development Group</a>, and are used in conformance
        with the Group’s <a href="https://www.edrdg.org/edrdg/licence.html">licence</a>.
      </p>
      <a href={creditsHref}>Credits</a>
    </div>
  </footer>
);

/** One credit a licence asks for, already computed from Provenance by content-graph. Never typed by hand. */
export type Credit = { text: string; href?: string };

/**
 * The inline Attribution for one record. Slices show it on the answer and result side, in Browse and in
 * detail views, and never on a prompt. An empty list means the licence asks for no inline credit.
 */
export const Attribution = ({ credits }: { credits: readonly Credit[] }) =>
  credits.length === 0 ? null : (
    <p className="attribution">
      Credit:{" "}
      {credits.map((credit, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {credit.href ? <a href={credit.href}>{credit.text}</a> : credit.text}
        </Fragment>
      ))}
    </p>
  );
