import type { ReactNode } from "react";
import { Footer } from "./attribution.tsx";
import { Mark } from "./mark.tsx";

/**
 * Every screen's frame: a quiet top line with the seal, the nav entries and an aside (search, account),
 * the screen, the dock along the bottom when there is one, and the EDRDG footer.
 */
export const Layout = ({ nav, aside, dock, children }: { nav?: ReactNode; aside?: ReactNode; dock?: ReactNode; children: ReactNode }) => (
  <div className="app">
    <header className="wrap app-nav">
      <a className="brand" href="/">
        <Mark />
        mojibun
      </a>
      {nav && (
        <nav aria-label="Main" className="nav-links">
          {nav}
        </nav>
      )}
      <div className="nav-aside">{aside}</div>
    </header>
    <main className="wrap app-main">{children}</main>
    <Footer />
    {dock && <div className="app-dock">{dock}</div>}
  </div>
);
