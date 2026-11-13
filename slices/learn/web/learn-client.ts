import type { JlptLevel } from "@ibbun/shared";
import { levelQuery } from "@ibbun/ui";
import { Batch, BatchTextStart, BatchTextStatus, CompleteResponse, LookupView, State, type CompleteRequest, type Track } from "../contract.ts";
import { ClipVerdict, type ClipAnswer } from "../listening/contract.ts";

const BASE = "/api/learn";

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) {
    const message = ((await response.json().catch(() => null)) as { message?: string } | null)?.message;
    throw new Error(message ?? (response.status >= 500 ? "Learn could not load. Nothing you did caused this; try again in a moment." : response.statusText));
  }
  return response.json();
};

const send = (method: string, path: string, body: unknown) =>
  call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Everything the Learn screen asks of the API. */
export type LearnApi = {
  state: () => Promise<State>;
  /** The next batch, from one level when the screen is filtered to it. */
  batch: (level?: JlptLevel) => Promise<Batch>;
  /** The Learn now batch for one Study Item: it and its pulled-in dependencies. */
  now: (studyItemId: string) => Promise<Batch>;
  saveTracks: (tracks: Track[]) => Promise<State>;
  skip: (studyItemId: string, now?: boolean) => Promise<void>;
  complete: (request: CompleteRequest) => Promise<number>;
  /** Grades one try at a Listening Clip's quiz; a pass is recorded. */
  answerClip: (answer: ClipAnswer) => Promise<ClipVerdict>;
  /** Asks for the Batch Text of the picked batch; false when the Learner is at the limit and the batch gets none. */
  startText: (studyItemIds: string[]) => Promise<boolean>;
  text: (studyItemIds: string[]) => Promise<BatchTextStatus>;
  lookUp: (wordId: string) => Promise<LookupView>;
};

export const learnApi: LearnApi = {
  state: async () => State.parse(await call("/state")),
  batch: async (level) => Batch.parse(await call(`/batch${levelQuery(level)}`)),
  now: async (studyItemId) => Batch.parse(await call(`/now/${encodeURIComponent(studyItemId)}`)),
  saveTracks: async (tracks) => State.parse(await send("PUT", "/tracks", { tracks })),
  skip: async (studyItemId, now) => void (await send("POST", "/skip", { studyItemId, now })),
  complete: async (request) => CompleteResponse.parse(await send("POST", "/complete", request)).recorded,
  answerClip: async (answer) => ClipVerdict.parse(await send("POST", "/clip/answer", answer)),
  startText: async (studyItemIds) => BatchTextStart.parse(await send("POST", "/batch-text", { studyItemIds })).enqueued,
  text: async (studyItemIds) => BatchTextStatus.parse(await call(`/batch-text?ids=${studyItemIds.join(",")}`)),
  lookUp: async (wordId) => LookupView.parse(await send("POST", "/lookups", { wordId })),
};
