import type { ReactNode } from "react";
import { Footer } from "./attribution.tsx";
import { Mark } from "./mark.tsx";

/**
 * Every screen's frame: the screen's kanji large in the background, a quiet top line with the seal as the way home,
 * what the app puts beside it (the levels, or a session's name) and an aside (search, account),
 * the screen, the dock along the bottom when there is one, and the EDRDG footer.
 */
export const Layout = ({
  nav,
  aside,
  dock,
  kanji,
  children,
}: {
  nav?: ReactNode;
  aside?: ReactNode;
  dock?: ReactNode;
  kanji?: string;
  children: ReactNode;
}) => (
  <div className="app">
    {kanji && (
      <span className="app-kanji" lang="ja" aria-hidden="true">
        {kanji}
      </span>
    )}
    <header className="wrap app-nav">
      <a className="brand" href="/" aria-label="ibbun">
        <Mark />
      </a>
      {nav && <div className="nav-links">{nav}</div>}
      <div className="nav-aside">{aside}</div>
    </header>
    <main className="wrap app-main">{children}</main>
    <Footer />
    {dock && <div className="app-dock">{dock}</div>}
  </div>
);
