import { Batch, CompleteResponse, State, type CompleteRequest, type Track } from "../contract.ts";

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
  saveTracks: (tracks: Track[]) => Promise<State>;
  skip: (studyItemId: string) => Promise<void>;
  complete: (request: CompleteRequest) => Promise<number>;
};

export const learnApi: LearnApi = {
  state: async () => State.parse(await call("/state")),
  batch: async () => Batch.parse(await call("/batch")),
  saveTracks: async (tracks) => State.parse(await send("PUT", "/tracks", { tracks })),
  skip: async (studyItemId) => void (await send("POST", "/skip", { studyItemId })),
  complete: async (request) => CompleteResponse.parse(await send("POST", "/complete", request)).recorded,
};
