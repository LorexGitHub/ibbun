import { Library, PracticeOptions, PracticeResult, TextView, type PracticeRequest } from "../contract.ts";

const BASE = "/api/reading/practice";

const fetchJson = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`reading practice ${path}: ${response.status}`);
  return response.json();
};

export const loadOptions = async () => PracticeOptions.parse(await fetchJson("/options"));

export const loadLibrary = async () => Library.parse(await fetchJson("/texts"));

export const loadPracticeText = async (id: string) => TextView.parse(await fetchJson(`/texts/${id}`));

export const generate = async (request: PracticeRequest) =>
  PracticeResult.parse(
    await fetchJson("/texts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }),
  );
