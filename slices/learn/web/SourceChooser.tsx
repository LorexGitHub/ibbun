import { useState } from "react";
import type { JlptLevel } from "@ibbun/shared";
import type { Track } from "../contract.ts";
import { atLevel, SOURCE_LEVELS, SOURCE_TYPES, sourceOf, toggled, tracksOf, typesAt, type Source } from "./source.ts";

const labelOf = (level: Track["level"]) => (level === "unlevelled" ? "Unlevelled" : level);

/**
 * Where Learn draws from, in one place: a level and the types taken from it. The level is kept here, so it stays
 * chosen while no type is ticked and no Track says it.
 */
export const SourceChooser = ({ tracks, filter, onChange }: { tracks: Track[]; filter?: JlptLevel; onChange: (tracks: Track[]) => void }) => {
  const [chosen, setSource] = useState<Source>(() => sourceOf(tracks));
  // A door opened for one level draws from it, so the chooser says that level, not the saved Tracks'.
  const source: Source = filter ? { level: filter, types: typesAt(tracks, filter) } : chosen;
  const choose = (next: Source) => {
    setSource(next);
    onChange(tracksOf(next));
  };
  return (
    <div className="source">
      <fieldset role="radiogroup" aria-label="Level" className="source-levels">
        {SOURCE_LEVELS.map((level) => (
          <label key={level} className="source-choice">
            <input type="radio" className="visually-hidden" name="learn-level" checked={source.level === level} onChange={() => choose(atLevel(source, level))} />
            {labelOf(level)}
          </label>
        ))}
      </fieldset>
      <fieldset aria-label="Types" className="source-types">
        {SOURCE_TYPES.map(({ type, label }) => (
          <label key={type} className="source-choice">
            <input type="checkbox" className="visually-hidden" checked={source.types.includes(type)} onChange={() => choose(toggled(source, type))} />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
};
