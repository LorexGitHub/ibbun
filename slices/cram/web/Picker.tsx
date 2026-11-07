import { useEffect, useState, type FormEvent } from "react";
import type { StudyItemSummary } from "@mojibun/content-graph";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";
import { Button, Card, Input } from "@mojibun/ui";
import type { CramType } from "../contract.ts";
import type { CramClient } from "./client.ts";

const TYPES: { value: CramType | ""; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "kanji", label: "Kanji" },
  { value: "word", label: "Words" },
  { value: "grammar_point", label: "Grammar" },
];

const describe = (item: StudyItemSummary) => [item.label, item.reading, item.meaning].filter(Boolean).join(" · ");

type FilterProps = {
  level: JlptLevel;
  type: CramType | "";
  search: string;
  setLevel: (level: JlptLevel) => void;
  setType: (type: CramType | "") => void;
  setSearch: (search: string) => void;
  onFind: (event: FormEvent) => void;
};

const Filters = ({ level, type, search, setLevel, setType, setSearch, onFind }: FilterProps) => (
  <form onSubmit={onFind} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
    <label>
      Level{" "}
      <select className="input" value={level} onChange={(e) => setLevel(e.target.value as JlptLevel)}>
        {JLPT_LEVELS.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
    </label>
    <label>
      Type{" "}
      <select className="input" value={type} onChange={(e) => setType(e.target.value as CramType | "")}>
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
    <label>
      Search <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
    </label>
    <Button type="submit">Find</Button>
  </form>
);

/** Choose Study Items by level, type or search. Locked ones are listed: Cram practises anything. */
export const Picker = ({ client, onStart }: { client: CramClient; onStart: (items: StudyItemSummary[]) => void }) => {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [type, setType] = useState<CramType | "">("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState<StudyItemSummary[]>([]);
  const [chosen, setChosen] = useState<Map<string, StudyItemSummary>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const typeFilter = type || undefined;
  const load = async (query: { q?: string; level?: JlptLevel; type?: CramType }) => {
    const result = await client.items(query);
    setError(result.ok ? null : result.message);
    if (result.ok) setShown(result.data);
  };
  useEffect(() => void load({ level, type: typeFilter }), [level, type]);

  const find = (event: FormEvent) => {
    event.preventDefault();
    return load(search.trim() ? { q: search.trim(), type: typeFilter } : { level, type: typeFilter });
  };
  const toggle = (item: StudyItemSummary) =>
    setChosen((now) => {
      const next = new Map(now);
      if (!next.delete(item.id)) next.set(item.id, item);
      return next;
    });
  const chooseShown = () => setChosen((now) => new Map([...now, ...shown.map((i): [string, StudyItemSummary] => [i.id, i])]));

  return (
    <Card>
      <h1>Cram</h1>
      <p className="muted">
        Pick anything to practise, including what you have not unlocked. Cram never changes your Mastery or statistics.
      </p>
      <Filters level={level} type={type} search={search} setLevel={setLevel} setType={setType} setSearch={setSearch} onFind={find} />
      {error && <p role="alert">{error}</p>}
      <p>
        <Button onClick={chooseShown} disabled={!shown.length}>
          Choose all shown
        </Button>{" "}
        <Button onClick={() => setChosen(new Map())} disabled={!chosen.size}>
          Clear
        </Button>
      </p>
      <ul aria-label="Study Items" style={{ listStyle: "none", padding: 0 }}>
        {shown.map((item) => (
          <li key={item.id}>
            <label>
              <input type="checkbox" checked={chosen.has(item.id)} onChange={() => toggle(item)} /> <span lang="ja">{describe(item)}</span>
            </label>
          </li>
        ))}
      </ul>
      {!shown.length && !error && <p className="muted">Nothing found.</p>}
      <Button variant="primary" big disabled={!chosen.size} onClick={() => onStart([...chosen.values()])}>
        Practise {chosen.size} {chosen.size === 1 ? "item" : "items"}
      </Button>
    </Card>
  );
};
