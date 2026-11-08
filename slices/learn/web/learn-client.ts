import { Batch, BatchTextStart, BatchTextStatus, CompleteResponse, LookupView, State, type CompleteRequest, type Track } from "../contract.ts";

const BASE = "/api/learn";

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? response.statusText);
  return response.json();
};

const send = (method: string, path: string, body: unknown) =>
  call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Everything the Learn screen asks of the API. */
export type LearnApi = {
  state: () => Promise<State>;
  batch: () => Promise<Batch>;
  /** The Learn now batch for one Study Item: it and its pulled-in dependencies. */
  now: (studyItemId: string) => Promise<Batch>;
  saveTracks: (tracks: Track[]) => Promise<State>;
  skip: (studyItemId: string, now?: boolean) => Promise<void>;
  complete: (request: CompleteRequest) => Promise<number>;
  /** Asks for the Batch Text of the picked batch; false when the Learner is at the limit and the batch gets none. */
  startText: (studyItemIds: string[]) => Promise<boolean>;
  text: (studyItemIds: string[]) => Promise<BatchTextStatus>;
  lookUp: (wordId: string) => Promise<LookupView>;
};

export const learnApi: LearnApi = {
  state: async () => State.parse(await call("/state")),
  batch: async () => Batch.parse(await call("/batch")),
  now: async (studyItemId) => Batch.parse(await call(`/now/${encodeURIComponent(studyItemId)}`)),
  saveTracks: async (tracks) => State.parse(await send("PUT", "/tracks", { tracks })),
  skip: async (studyItemId, now) => void (await send("POST", "/skip", { studyItemId, now })),
  complete: async (request) => CompleteResponse.parse(await send("POST", "/complete", request)).recorded,
  startText: async (studyItemIds) => BatchTextStart.parse(await send("POST", "/batch-text", { studyItemIds })).enqueued,
  text: async (studyItemIds) => BatchTextStatus.parse(await call(`/batch-text?ids=${studyItemIds.join(",")}`)),
  lookUp: async (wordId) => LookupView.parse(await send("POST", "/lookups", { wordId })),
};
