import { useEffect, useState, type KeyboardEvent } from "react";
import { Navigate, useParams } from "react-router";
import { buttonClass, useLevelFilter } from "@ibbun/ui";
import { ItemResponse, LevelList, type BrowseType, type JlptLevel, type Tile } from "../contract.ts";
import { BrowseView } from "./BrowseView.tsx";
import { ItemView } from "./ItemView.tsx";

type Loaded<T> = { state: "loading" } | { state: "failed"; status: number } | { state: "ready"; value: T };

/** Fetches `url` and parses it; refetches when `url` changes, and drops a reply that arrives late. */
const useApi = <T,>(url: string, parse: (json: unknown) => T): Loaded<T> => {
  const [loaded, setLoaded] = useState<{ url: string; result: Loaded<T> } | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(url).then(async (res) => {
      const result: Loaded<T> = res.ok ? { state: "ready", value: parse(await res.json()) } : { state: "failed", status: res.status };
      if (live) setLoaded({ url, result });
    });
    return () => {
      live = false;
    };
  }, [url]);
  return loaded?.url === url ? loaded.result : { state: "loading" };
};

const loadFailure = (status: number) => (status === 401 ? "Log in to open the Library." : "The Library could not load this.");

/** One Study Item, wherever it is shown: its own page, or the sheet over the wall. */
const Item = ({ id, sheet = false }: { id: string; sheet?: boolean }) => {
  const loaded = useApi(`/api/browse/items/${encodeURIComponent(id)}`, (json) => ItemResponse.parse(json));
  if (loaded.state === "loading") return <p>Loading…</p>;
  if (loaded.state === "failed") return <p role="status">{loaded.status === 404 ? "There is no such Study Item." : loadFailure(loaded.status)}</p>;
  if ("redirectTo" in loaded.value) return <Navigate to={`/browse/items/${loaded.value.redirectTo}`} replace />;
  return <ItemView page={loaded.value} sheet={sheet} />;
};

/** A Study Item as a sheet over the wall. Esc, Close or a click beside it puts it away. */
const ItemSheet = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  return (
    <div className="wall-sheet-back" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Study Item" className="wall-sheet" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <button type="button" className={buttonClass()} autoFocus onClick={onClose}>
          Close
        </button>
        <Item id={id} sheet />
      </div>
    </div>
  );
};

/** The wall starts at the level in the address, and follows it when the header's level filter moves. */
const useLevel = () => {
  const inAddress = useLevelFilter();
  const [level, setLevel] = useState<JlptLevel>(inAddress || "N5");
  useEffect(() => {
    if (inAddress) setLevel(inAddress);
  }, [inAddress]);
  return [level, setLevel] as const;
};

export const BrowseScreen = () => {
  const [level, setLevel] = useLevel();
  const [track, setTrack] = useState<BrowseType>("kanji");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const loaded = useApi<Tile[]>(`/api/browse/levels/${level}`, (json) => LevelList.parse(json).items);
  return (
    <>
      <BrowseView
        level={level}
        track={track}
        query={query}
        tiles={loaded.state === "ready" ? loaded.value : null}
        message={loaded.state === "failed" ? loadFailure(loaded.status) : null}
        onLevel={setLevel}
        onTrack={setTrack}
        onQuery={setQuery}
        onOpen={setOpen}
      />
      {open && <ItemSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
};

export const ItemScreen = () => <Item id={useParams().id || ""} />;
