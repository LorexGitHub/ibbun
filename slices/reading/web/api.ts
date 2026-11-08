import { EpisodeLists, LookupView, TextView, type LookupRequest } from "../contract.ts";

const BASE = "/api/reading";

export const fetchJson = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`reading ${path}: ${response.status}`);
  return response.json();
};

export const loadEpisodes = async () => EpisodeLists.parse(await fetchJson("/episodes"));

export const loadBatchText = async (id: string) => TextView.parse(await fetchJson(`/batch-texts/${id}`));

export const loadPassage = async (id: string) => TextView.parse(await fetchJson(`/passages/${id}`));

/** POSTs `body` as JSON. */
export const postJson = (path: string, body: unknown) =>
  fetchJson(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const lookUp = async (request: LookupRequest) => LookupView.parse(await postJson("/lookups", request));
