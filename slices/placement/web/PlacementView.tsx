import { Button, pillClass } from "@ibbun/ui";
import { JLPT_LEVELS } from "@ibbun/shared";
import type { PlacementItem, PlacementList } from "../contract.ts";
import "./placement.css";

export type Track = PlacementItem["type"];

export const TRACKS: { type: Track; title: string }[] = [
  { type: "kanji", title: "Kanji" },
  { type: "word", title: "Words" },
  { type: "grammar_point", title: "Grammar" },
];

export type PlacementViewProps = {
  level: PlacementList["level"];
  track: Track;
  list: PlacementList | null;
  ticked: ReadonlySet<string>;
  message: string | null;
  /** A save is in flight. */
  saving?: boolean;
  /** Absent when the Level filter picks the level: the header then holds the levels. */
  onLevel?: (level: PlacementList["level"]) => void;
  onTrack: (track: Track) => void;
  onToggle: (id: string) => void;
  /** Ticks every item of the Track that is not Known yet, or unticks them when all are ticked. */
  onAll: () => void;
  onSubmit: () => void;
};

/** One Study Item. A Known tile is pressed and locked: once Known, always Known. A Kanji is its glyph; the wider tiles add reading and meaning. */
const Tile = ({ item, ticked, onToggle }: { item: PlacementItem; ticked: boolean; onToggle: (id: string) => void }) => (
  <li>
    <button type="button" className="placement-tile" aria-pressed={item.known || ticked} disabled={item.known} data-known={item.known} title={item.meaning || undefined} onClick={() => onToggle(item.id)}>
      <span lang="ja" className="placement-tile-label">{item.label}</span>
      {item.type !== "kanji" && item.reading && <span lang="ja" className="placement-tile-reading">{item.reading}</span>}
      {item.type !== "kanji" && item.meaning && <span className="placement-tile-meaning">{item.meaning}</span>}
    </button>
  </li>
);

const Wall = ({ level, track, items, ticked, onToggle, onAll, onTrack }: Pick<PlacementViewProps, "level" | "track" | "ticked" | "onToggle" | "onAll" | "onTrack"> & { items: PlacementItem[] }) => {
  const title = TRACKS.find((t) => t.type === track)!.title;
  if (items.length === 0) {
    return (
      <>
        <p>No {level} {title} yet.</p>
        {track !== "kanji" && <Button onClick={() => onTrack("kanji")}>Back to Kanji</Button>}
      </>
    );
  }
  const open = items.filter((item) => !item.known);
  return (
    <>
      <Button aria-pressed={open.length > 0 && open.every((item) => ticked.has(item.id))} disabled={open.length === 0} onClick={onAll}>
        All of {level} {title}
      </Button>
      <ul className="placement-wall" data-track={track} aria-label={`${level} ${title}`}>
        {items.map((item) => <Tile key={item.id} item={item} ticked={ticked.has(item.id)} onToggle={onToggle} />)}
      </ul>
    </>
  );
};

/** The wall of a level and Track: tap what is Known, or take the whole level at once, then Save. */
export const PlacementView = ({ level, track, list, ticked, message, saving, onLevel, onTrack, onToggle, onAll, onSubmit }: PlacementViewProps) => (
  <section aria-labelledby="placement-title" className="placement">
    <h1 id="placement-title">Placement</h1>
    <p>Tap what you already know. It becomes Known and still comes back for review.</p>
    {onLevel && (
      <div role="group" aria-label="JLPT Level" className="placement-tabs">
        {JLPT_LEVELS.map((l) => (
          <button key={l} type="button" className={pillClass(l === level)} aria-pressed={l === level} onClick={() => onLevel(l)}>
            {l}
          </button>
        ))}
      </div>
    )}
    <div role="group" aria-label="Track" className="placement-tabs">
      {TRACKS.map(({ type, title }) => (
        <button key={type} type="button" className={pillClass(type === track)} aria-pressed={type === track} onClick={() => onTrack(type)}>
          {title}
        </button>
      ))}
    </div>
    {list === null ? (
      <p>Loading {level}…</p>
    ) : (
      <>
        <Wall level={level} track={track} items={list.items.filter((item) => item.type === track)} ticked={ticked} onToggle={onToggle} onAll={onAll} onTrack={onTrack} />
        <div className="placement-save">
          <p>
            <b>{ticked.size}</b> to mark as Known · {list.items.filter((item) => item.known).length} of {list.items.length} Known
          </p>
          <Button variant="primary" big hotkey="Enter" disabled={ticked.size === 0 || saving} aria-busy={saving} onClick={onSubmit}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </>
    )}
    {message && <p role="status">{message}</p>}
  </section>
);
