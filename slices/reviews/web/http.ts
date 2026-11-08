import { useEffect, useState } from "react";

const BASE = "/api/reviews";

/** Calls the reviews API and returns its JSON, or throws the server's message. */
export const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? response.statusText);
  return response.json();
};

export const postJson = (path: string, body: unknown) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Loads once per `load`: the data, or the message it failed with. */
export const useLoaded = <T,>(load: () => Promise<T>): { data: T | null; failed: string | null } => {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    load().then(setData, (e: Error) => setFailed(e.message));
  }, [load]);
  return { data, failed };
};
