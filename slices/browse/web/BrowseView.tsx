import { Link } from "react-router";
import { Button, Card, pillClass } from "@mojibun/ui";
import { JLPT_LEVELS } from "@mojibun/shared";
import type { JlptLevel, Summary } from "../contract.ts";

const GROUPS: { type: Summary["type"]; title: string }[] = [
  { type: "kanji", title: "Kanji" },
  { type: "word", title: "Words" },
  { type: "grammar_point", title: "Grammar" },
];

/** A plain level label, with no marker saying it is an estimate (docs/jlpt-levels.md#what-learners-see). */
export const levelLabel = (level: JlptLevel | null) => level ?? "Unlevelled";

export const itemPath = (id: string) => `/browse/items/${id}`;

const Row = ({ item }: { item: Summary }) => (
  <li>
    <Link to={itemPath(item.id)} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
      <span lang="ja">{item.label}</span>
      {item.reading && <span lang="ja">{item.reading}</span>}
      {item.meaning && <span>{item.meaning}</span>}
      <span className={pillClass(false)}>{levelLabel(item.level)}</span>
    </Link>
  </li>
);

const Groups = ({ items }: { items: Summary[] }) => (
  <>
    {GROUPS.map(({ type, title }) => {
      const group = items.filter((i) => i.type === type);
      return group.length === 0 ? null : (
        <Card key={type}>
          <h2>{title}</h2>
          <ul>
            {group.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </Card>
      );
    })}
  </>
);

export type BrowseViewProps = {
  query: string;
  level: JlptLevel;
  /** Search results when there is a query, else the level's list; null while loading. */
  items: Summary[] | null;
  message: string | null;
  onQuery: (query: string) => void;
  onLevel: (level: JlptLevel) => void;
};

/** Search plus the level lists. Searching replaces the list until the box is cleared. */
export const BrowseView = ({ query, level, items, message, onQuery, onLevel }: BrowseViewProps) => {
  const searching = query.trim() !== "";
  return (
    <section aria-labelledby="browse-title">
      <h1 id="browse-title">Browse</h1>
      <input
        type="search"
        className="input"
        aria-label="Search"
        placeholder="Search by word, reading or meaning"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {!searching && (
        <div role="group" aria-label="JLPT Level">
          {JLPT_LEVELS.map((l) => (
            <button key={l} type="button" className={pillClass(l === level)} aria-pressed={l === level} onClick={() => onLevel(l)}>
              {l}
            </button>
          ))}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {items === null ? (
        <p>Loading…</p>
      ) : items.length > 0 ? (
        <Groups items={items} />
      ) : searching ? (
        <>
          <p>{`Nothing matches "${query.trim()}".`}</p>
          <Button onClick={() => onQuery("")}>Clear the search</Button>
        </>
      ) : (
        <p>{`Nothing at ${level} yet. Pick another level above.`}</p>
      )}
    </section>
  );
};

