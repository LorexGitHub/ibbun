import type { NavEntry } from "@mojibun/slice";
import { NavLink } from "react-router";
import { Dock, DockIcon } from "@/components/ui/dock";

/** The app's map along the bottom: one glyph per place, its name on hover and focus, a dot under the current one. */
export const AppDock = ({ entries }: { entries: NavEntry[] }) => (
  <nav aria-label="Main" className="dock-scroll">
    <Dock iconSize={44} iconMagnification={62} iconDistance={120} className="app-dock-bar mt-0">
      {entries.map((e) => (
        <DockIcon key={e.path} className="bg-transparent">
          <NavLink to={e.path} end={e.path === "/"} aria-label={e.label} className="dock-link">
            <span lang="ja" aria-hidden="true">
              {e.glyph ?? e.label[0]}
            </span>
            <span className="dock-tip" aria-hidden="true">
              {e.label}
            </span>
          </NavLink>
        </DockIcon>
      ))}
    </Dock>
  </nav>
);
