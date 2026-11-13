import { Button, Input } from "@ibbun/ui";
import { JLPT_LEVELS } from "@ibbun/shared";
import type { BrowseType, JlptLevel, Mastery, Tile } from "../contract.ts";
import "./browse.css";

export const TRACKS: { type: BrowseType; title: string }[] = [
  { type: "kanji", title: "Kanji" },
  { type: "word", title: "Words" },
  { type: "grammar_point", title: "Grammar" },
];

/** Lightest first: the order of the legend and of the count line. */
export const MASTERIES: { value: Mastery; label: string }[] = [
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "relearning", label: "Relearning" },
  { value: "young", label: "Young" },
  { value: "mature", label: "Mature" },
];

const masteryName = (mastery: Mastery) => MASTERIES.find((m) => m.value === mastery)!.label;

/** A plain level label, with no marker saying it is an estimate (docs/jlpt-levels.md#what-learners-see). */
export const levelLabel = (level: JlptLevel | null) => level || "Unlevelled";

export const itemPath = (id: string) => `/browse/items/${id}`;

/** Whether a tile stays lit for what is typed: by written form, reading or meaning. Nothing typed lights them all. */
export const matches = (tile: Tile, query: string) => {
  const q = query.trim().toLowerCase();
  return [tile.label, tile.reading, tile.meaning].some((text) => text?.toLowerCase().includes(q));
};

/** "12 Learning, 3 Young": every Mastery past New that the wall holds. */
export const tally = (tiles: Tile[]) =>
  MASTERIES.slice(1)
    .map(({ value, label }) => ({ label, count: tiles.filter((t) => t.mastery === value).length }))
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${count} ${label}`)
    .join(", ");

type TabsProps<T extends string> = { name: string; tabs: { value: T; label: string }[]; current: T; onPick: (value: T) => void };

const Tabs = <T extends string>({ name, tabs, current, onPick }: TabsProps<T>) => (
  <div role="tablist" aria-label={name} className="wall-tabs">
    {tabs.map((tab) => (
      <button key={tab.value} type="button" role="tab" aria-selected={tab.value === current} onClick={() => onPick(tab.value)}>
        {tab.label}
      </button>
    ))}
  </div>
);

const LEVEL_TABS = JLPT_LEVELS.map((level) => ({ value: level, label: level }));
const TRACK_TABS = TRACKS.map(({ type, title }) => ({ value: type, label: title }));

const Legend = () => (
  <ul aria-label="Mastery" className="wall-legend">
    {MASTERIES.map(({ value, label }) => (
      <li key={value}>
        <span className="wall-swatch" data-mastery={value} aria-hidden="true" />
        {label}
      </li>
    ))}
  </ul>
);

const tileName = (tile: Tile) => [tile.label, tile.meaning, masteryName(tile.mastery)].filter(Boolean).join(", ");

type WallProps = { name: string; track: BrowseType; tiles: Tile[]; query: string; onOpen: (id: Tile["id"]) => void };

const Wall = ({ name, track, tiles, query, onOpen }: WallProps) => (
  <ul aria-label={name} className="wall" data-track={track}>
    {tiles.map((tile) => (
      <li key={tile.id}>
        <button type="button" className="tile" lang="ja" data-mastery={tile.mastery} data-dim={!matches(tile, query) || undefined} aria-label={tileName(tile)} onClick={() => onOpen(tile.id)}>
          {tile.label}
        </button>
      </li>
    ))}
  </ul>
);

export type BrowseViewProps = {
  level: JlptLevel;
  track: BrowseType;
  query: string;
  /** Every Study Item of the level; null while loading. */
  tiles: Tile[] | null;
  message: string | null;
  onLevel: (level: JlptLevel) => void;
  onTrack: (track: BrowseType) => void;
  onQuery: (query: string) => void;
  onOpen: (id: Tile["id"]) => void;
};

const Counted = ({ title, level, tiles, query, onQuery }: { title: string; level: JlptLevel; tiles: Tile[]; query: string; onQuery: (query: string) => void }) => {
  const lit = tiles.filter((t) => matches(t, query)).length;
  if (tiles.length === 0) return <p>{`No ${title} at ${level} yet. Pick another level or Track above.`}</p>;
  if (lit === 0)
    return (
      <p>
        {`Nothing on this wall matches "${query.trim()}". `}
        <Button onClick={() => onQuery("")}>Clear the search</Button>
      </p>
    );
  return (
    <p className="wall-count">
      {`${tiles.length} ${title} at ${level}. ${tally(tiles) || "None started yet"}.`}
      {query.trim() !== "" && ` ${lit} match.`}
    </p>
  );
};

/** The Mastery wall: one level and Track at a time, every Study Item a tile shaded by Mastery. Typing dims what does not match. */
export const BrowseView = ({ level, track, query, tiles, message, onLevel, onTrack, onQuery, onOpen }: BrowseViewProps) => {
  const title = TRACKS.find((t) => t.type === track)!.title;
  const onWall = tiles?.filter((t) => t.type === track);
  return (
    <section aria-labelledby="browse-title" className="library">
      <h1 id="browse-title">Library</h1>
      <div className="wall-bar">
        <Tabs name="JLPT Level" tabs={LEVEL_TABS} current={level} onPick={onLevel} />
        <Tabs name="Track" tabs={TRACK_TABS} current={track} onPick={onTrack} />
        <Input type="search" aria-label="Search" placeholder="Find on this wall" value={query} onChange={(e) => onQuery(e.target.value)} />
      </div>
      {message && <p role="status">{message}</p>}
      {onWall ? (
        <>
          <Counted title={title} level={level} tiles={onWall} query={query} onQuery={onQuery} />
          <Wall name={`${level} ${title}`} track={track} tiles={onWall} query={query} onOpen={onOpen} />
          <Legend />
        </>
      ) : (
        !message && <p>Loading…</p>
      )}
    </section>
  );
};
