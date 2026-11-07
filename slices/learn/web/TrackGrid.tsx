import { JLPT_LEVELS } from "@mojibun/shared";
import type { Track } from "../contract.ts";

const LEVELS = [...JLPT_LEVELS, "unlevelled"] as const;
const TYPES: { type: Track["type"]; label: string }[] = [
  { type: "kanji", label: "Kanji" },
  { type: "word", label: "Words" },
  { type: "grammar_point", label: "Grammar" },
];

const labelOf = (level: (typeof LEVELS)[number]) => (level === "unlevelled" ? "Unlevelled" : level);
const same = (a: Track, b: Track) => a.level === b.level && a.type === b.type;

/** The Active Track grid: one checkbox per Study Item type and level. */
export const TrackGrid = ({ tracks, onChange }: { tracks: Track[]; onChange: (tracks: Track[]) => void }) => {
  const toggle = (t: Track) => onChange(tracks.some((a) => same(a, t)) ? tracks.filter((a) => !same(a, t)) : [...tracks, t]);
  return (
    <table>
      <caption>Active Tracks</caption>
      <thead>
        <tr>
          <th scope="col">Level</th>
          {TYPES.map((c) => (
            <th key={c.type} scope="col">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {LEVELS.map((level) => (
          <tr key={level}>
            <th scope="row">{labelOf(level)}</th>
            {TYPES.map(({ type, label }) => (
              <td key={type}>
                <input
                  type="checkbox"
                  aria-label={`${labelOf(level)} ${label}`}
                  checked={tracks.some((a) => same(a, { level, type }))}
                  onChange={() => toggle({ level, type })}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
