import { useEffect, useState, type FormEvent } from "react";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";
import { Button, buttonClass, Input, Pill, useLevelFilter } from "@mojibun/ui";
import type { CramItem, CramMastery, CramType, ItemQuery } from "../contract.ts";
import type { CramClient } from "./client.ts";
import "./cram.css";

const TYPES: { value: CramType | ""; label: string }[] = [
  { value: "", label: "Every type" },
  { value: "kanji", label: "Kanji" },
  { value: "word", label: "Words" },
  { value: "grammar_point", label: "Grammar" },
];

const MASTERIES: { value: CramMastery | ""; label: string }[] = [
  { value: "", label: "Any Mastery" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "young", label: "Young" },
  { value: "mature", label: "Mature" },
  { value: "relearning", label: "Relearning" },
];

const masteryName = (mastery: CramMastery) => MASTERIES.find((m) => m.value === mastery)!.label;

const gloss = (item: CramItem) => [item.reading, item.meaning].filter(Boolean).join(" · ");

type Filter = { level: JlptLevel; type: CramType | ""; mastery: CramMastery | ""; search: string };

/** A search looks through every level; without one the list is the chosen level. */
export const queryFor = ({ level, type, mastery, search }: Filter): ItemQuery => ({
  ...(search.trim() ? { q: search.trim() } : { level }),
  type: type || undefined,
  mastery: mastery || undefined,
});

const Chooser = <T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
  <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value as T)}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const LEVELS = JLPT_LEVELS.map((level) => ({ value: level, label: level }));

/** Level, type, Mastery and the search in one row. A chooser lists again at once; the search waits for Enter. */
const Filters = ({ filter, onChange }: { filter: Filter; onChange: (filter: Filter) => void }) => {
  const [typed, setTyped] = useState(filter.search);
  const find = (event: FormEvent) => {
    event.preventDefault();
    onChange({ ...filter, search: typed });
  };
  return (
    <form role="search" className="cram-filters" onSubmit={find}>
      <Chooser name="Level" value={filter.level} options={LEVELS} onChange={(level) => onChange({ ...filter, level })} />
      <Chooser name="Type" value={filter.type} options={TYPES} onChange={(type) => onChange({ ...filter, type })} />
      <Chooser name="Mastery" value={filter.mastery} options={MASTERIES} onChange={(mastery) => onChange({ ...filter, mastery })} />
      <Input type="search" aria-label="Search" placeholder="Search every level, then Enter" value={typed} onChange={(e) => setTyped(e.target.value)} />
    </form>
  );
};

type Choice = Map<string, CramItem>;

/** The Study Items in the basket, kept across lists. */
const useBasket = () => {
  const [chosen, setChosen] = useState<Choice>(new Map());
  return {
    chosen,
    toggle: (item: CramItem) =>
      setChosen((now) => {
        const next = new Map(now);
        if (!next.delete(item.id)) next.set(item.id, item);
        return next;
      }),
    add: (items: CramItem[]) => setChosen((now) => new Map([...now, ...items.map((i): [string, CramItem] => [i.id, i])])),
    clear: () => setChosen(new Map()),
  };
};

const Choices = ({ shown, chosen, toggle }: { shown: CramItem[]; chosen: Choice; toggle: (item: CramItem) => void }) => (
  <ul aria-label="Study Items" className="cram-list">
    {shown.map((item) => (
      <li key={item.id}>
        <label>
          <input type="checkbox" checked={chosen.has(item.id)} onChange={() => toggle(item)} />
          <span className="jp" lang="ja">
            {item.label}
          </span>
          <span className="cram-gloss">{gloss(item)}</span>
          <Pill>{masteryName(item.mastery)}</Pill>
        </label>
      </li>
    ))}
  </ul>
);

const NothingMatches = () => (
  <p className="muted">
    Nothing matches. Try another level, type or search word, or look it up in the Library.{" "}
    <a className={buttonClass()} href="/browse">
      Open the Library
    </a>
  </p>
);

type BasketProps = { chosen: Choice; toggle: (item: CramItem) => void; clear: () => void; onStart: (items: CramItem[]) => void };

const Basket = ({ chosen, toggle, clear, onStart }: BasketProps) => (
  <aside aria-label="Basket" className="cram-basket">
    <h2>
      Basket <span className="muted">{chosen.size}</span>
    </h2>
    {chosen.size ? (
      <ul aria-label="Chosen">
        {[...chosen.values()].map((item) => (
          <li key={item.id}>
            <span className="jp" lang="ja">
              {item.label}
            </span>
            <button type="button" aria-label={`Remove ${item.label}`} onClick={() => toggle(item)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">Tick anything in the list. It waits here while you look for more.</p>
    )}
    <Button variant="primary" big disabled={!chosen.size} onClick={() => onStart([...chosen.values()])}>
      Practise {chosen.size} {chosen.size === 1 ? "item" : "items"}
    </Button>
    <Button onClick={clear} disabled={!chosen.size}>
      Clear
    </Button>
  </aside>
);

/** The list for a filter, and why it failed when it did. */
const useItems = (client: CramClient, filter: Filter) => {
  const [shown, setShown] = useState<CramItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void client.items(queryFor(filter)).then((result) => {
      if (!current) return;
      setError(result.ok ? null : result.message);
      if (result.ok) setShown(result.data);
    });
    return () => {
      current = false;
    };
  }, [client, filter]);
  return { shown, error };
};

/** The filter starts at the level in the address, and follows it when the header's level filter moves. */
const useFilter = () => {
  const inAddress = useLevelFilter();
  const [filter, setFilter] = useState<Filter>({ level: inAddress ?? "N5", type: "", mastery: "", search: "" });
  useEffect(() => {
    if (inAddress) setFilter((now) => ({ ...now, level: inAddress }));
  }, [inAddress]);
  return [filter, setFilter] as const;
};

/** Choose Study Items into a basket, by level, type, Mastery or search. Locked ones are listed: Cram practises anything. */
export const Picker = ({ client, onStart }: { client: CramClient; onStart: (items: CramItem[]) => void }) => {
  const [filter, setFilter] = useFilter();
  const { shown, error } = useItems(client, filter);
  const { chosen, toggle, add, clear } = useBasket();

  return (
    <div className="cram-picker">
      <header>
        <h1>Cram</h1>
        <p className="muted">Pick anything to practise, including what you have not unlocked. Cram never changes your Mastery or statistics.</p>
      </header>
      <section aria-label="Choose" className="cram-choose">
        <Filters filter={filter} onChange={setFilter} />
        {error && <p role="alert">{error}</p>}
        <p className="cram-shown">
          <span className="muted">{shown.length} shown</span>
          <Button onClick={() => add(shown)} disabled={!shown.length}>
            Choose all shown
          </Button>
        </p>
        <Choices shown={shown} chosen={chosen} toggle={toggle} />
        {!shown.length && !error && <NothingMatches />}
      </section>
      <Basket chosen={chosen} toggle={toggle} clear={clear} onStart={onStart} />
    </div>
  );
};
