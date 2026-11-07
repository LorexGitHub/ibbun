import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { ItemResponse, LevelList, SearchResults, type JlptLevel, type Summary } from "../contract.ts";
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

const loadFailure = (status: number) => (status === 401 ? "Log in to browse." : "Browse could not load this.");

export const BrowseScreen = () => {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<JlptLevel>("N5");
  const q = query.trim();
  const url = q === "" ? `/api/browse/levels/${level}` : `/api/browse/search?q=${encodeURIComponent(q)}`;
  const loaded = useApi<Summary[]>(url, (json) => (q === "" ? LevelList.parse(json).items : SearchResults.parse(json).items));
  return (
    <BrowseView
      query={query}
      level={level}
      items={loaded.state === "ready" ? loaded.value : null}
      message={loaded.state === "failed" ? loadFailure(loaded.status) : null}
      onQuery={setQuery}
      onLevel={setLevel}
    />
  );
};

export const ItemScreen = () => {
  const { id = "" } = useParams();
  const loaded = useApi(`/api/browse/items/${encodeURIComponent(id)}`, (json) => ItemResponse.parse(json));
  if (loaded.state === "loading") return <p>Loading…</p>;
  if (loaded.state === "failed") return <p role="status">{loaded.status === 404 ? "There is no such Study Item." : loadFailure(loaded.status)}</p>;
  if ("redirectTo" in loaded.value) return <Navigate to={`/browse/items/${loaded.value.redirectTo}`} replace />;
  return <ItemView page={loaded.value} />;
};
