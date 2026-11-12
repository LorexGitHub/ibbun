import { Button, Card, pillClass } from "@mojibun/ui";
import { JLPT_LEVELS } from "@mojibun/shared";
import type { PlacementItem, PlacementList } from "../contract.ts";

const GROUPS: { type: PlacementItem["type"]; title: string }[] = [
  { type: "kanji", title: "Kanji" },
  { type: "word", title: "Words" },
  { type: "grammar_point", title: "Grammar" },
];

export type PlacementViewProps = {
  level: PlacementList["level"];
  list: PlacementList | null;
  ticked: ReadonlySet<string>;
  message: string | null;
  /** Absent when the Level filter picks the level: the header then holds the levels. */
  onLevel?: (level: PlacementList["level"]) => void;
  onToggle: (id: string) => void;
  onSubmit: () => void;
};

/** The per-level tick-list. A Known item is ticked and locked: once Known, always Known. */
export const PlacementView = ({ level, list, ticked, message, onLevel, onToggle, onSubmit }: PlacementViewProps) => (
  <section aria-labelledby="placement-title">
    <h1 id="placement-title">Placement</h1>
    <p>Tick what you already know at this level. Ticked items become Known and still come back for review.</p>
    {onLevel && (
      <div role="group" aria-label="JLPT Level">
        {JLPT_LEVELS.map((l) => (
          <button key={l} type="button" className={pillClass(l === level)} aria-pressed={l === level} onClick={() => onLevel(l)}>
            {l}
          </button>
        ))}
      </div>
    )}
    {list === null ? (
      <p>Loading {level}…</p>
    ) : (
      <>
        {GROUPS.map(({ type, title }) => {
          const items = list.items.filter((i) => i.type === type);
          return items.length === 0 ? null : (
            <Card key={type}>
              <fieldset>
                <legend>{title}</legend>
                {items.map((item) => (
                  <label key={item.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                    <input
                      type="checkbox"
                      checked={item.known || ticked.has(item.id)}
                      disabled={item.known}
                      onChange={() => onToggle(item.id)}
                    />
                    <span lang="ja">{item.label}</span>
                    {item.reading && <span lang="ja">{item.reading}</span>}
                    {item.meaning && <span>{item.meaning}</span>}
                    {item.known && <span className={pillClass(false)}>Known</span>}
                  </label>
                ))}
              </fieldset>
            </Card>
          );
        })}
        <Button variant="primary" big disabled={ticked.size === 0} onClick={onSubmit}>
          Mark {ticked.size} as Known
        </Button>
      </>
    )}
    {message && <p role="status">{message}</p>}
  </section>
);
