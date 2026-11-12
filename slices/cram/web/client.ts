import type { CramItem, ItemQuery, Question, Submission, Verdict } from "../contract.ts";

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

/** Cram's HTTP API, as the screen sees it. Tests hand the screen a fake. */
export type CramClient = {
  items(query: ItemQuery): Promise<Result<CramItem[]>>;
  question(studyItemId: string, after?: string): Promise<Result<Question>>;
  submit(submission: Submission): Promise<Result<Verdict>>;
};

const BASE = "/api/cram";

const send = async <T>(send: typeof fetch, path: string, init?: RequestInit): Promise<Result<T>> => {
  const response = await send(`${BASE}${path}`, { credentials: "same-origin", ...init });
  const json = await response.json().catch(() => null);
  return response.ok ? { ok: true, data: json as T } : { ok: false, status: response.status, message: json?.message || response.statusText };
};

export const createCramClient = (fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): CramClient => ({
  items: (query) => send(fetcher, `/items?${new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]))}`),
  question: (id, after) => send(fetcher, `/items/${id}/question${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  submit: (submission) =>
    send(fetcher, "/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) }),
});
