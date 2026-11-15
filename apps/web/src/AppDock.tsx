import type { NavEntry } from "@ibbun/slice";
import { useSyncExternalStore } from "react";
import { NavLink } from "react-router";
import { Dock, DockIcon } from "@/vendor/ui/dock";

/** Phones: eight 44px glyphs don't fit 390px, so the dock draws them smaller and doesn't magnify (there's no pointer). */
const NARROW = "(max-width: 520px)";
const useNarrow = () =>
  useSyncExternalStore(
    (change) => {
      const media = matchMedia(NARROW);
      media.addEventListener("change", change);
      return () => media.removeEventListener("change", change);
    },
    () => matchMedia(NARROW).matches,
    () => false,
  );

/** The app's map along the bottom: one glyph per place, its name on hover and focus, a dot under the current one. */
export const AppDock = ({ entries }: { entries: NavEntry[] }) => {
  const size = useNarrow() ? 34 : 44;
  return (
    <nav aria-label="Main" className="dock-scroll">
      <Dock iconSize={size} iconMagnification={size === 44 ? 62 : size} iconDistance={120} className="app-dock-bar mt-0">
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
};
