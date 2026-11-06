import type { ReactNode } from "react";
import { Footer } from "./attribution.tsx";
import { Mark } from "./mark.tsx";
import { Sheet } from "./paper.tsx";

/**
 * Every screen's frame: the torn nav sheet with the brand, the nav entries and an aside (level, account),
 * the screen itself, and the EDRDG footer.
 */
export const Layout = ({ nav, aside, children }: { nav: ReactNode; aside?: ReactNode; children: ReactNode }) => (
  <div className="app">
    <Sheet tear="nav" fill="paper">
      <header className="wrap app-nav">
        <a className="brand" href="/">
          <Mark />
          mojibun
        </a>
        <nav aria-label="Main" className="nav-links">
          {nav}
        </nav>
        <div className="nav-aside">{aside}</div>
      </header>
    </Sheet>
    <main className="wrap app-main">{children}</main>
    <Footer />
  </div>
);
