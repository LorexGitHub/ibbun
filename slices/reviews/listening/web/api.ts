import { ClipAnswerResponse, ClipDueResponse, type ClipAnswerRequest } from "../contract.ts";

const BASE = "/api/reviews/listening";

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(`listening ${path}: ${response.status}`);
  return response.json();
};

export type LoadClips = () => Promise<ClipDueResponse>;
export type AnswerClip = (request: ClipAnswerRequest) => Promise<ClipAnswerResponse>;

export const loadDueClips: LoadClips = async () => ClipDueResponse.parse(await call("/due"));

export const answerClip: AnswerClip = async (request) =>
  ClipAnswerResponse.parse(
    await call("/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }),
  );
