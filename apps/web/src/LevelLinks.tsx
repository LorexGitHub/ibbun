import { NavLink } from "react-router";
import { levelPath, LEVELS } from "./places.ts";

/** The five levels in the top line. Each opens its level page; the one the Learner is on is lit. */
export const LevelLinks = () => (
  <nav aria-label="Levels" className="levels">
    {LEVELS.map((level) => (
      <NavLink key={level.name} to={levelPath(level)} className="level-link">
        {level.name}
      </NavLink>
    ))}
  </nav>
);
