import { z } from "zod";
import { AnswerResponse, ClipView, type AnswerRequest } from "../../contract.ts";
import { LibraryEntry, Options, type GenerateRequest } from "../contract.ts";

const BASE = "/api/listening/practice";

/** The server's own words ("try again tomorrow") are for the Learner, so they travel in the error. */
const call = async (path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${BASE}${path}`, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(z.object({ message: z.string() }).safeParse(body).data?.message ?? `practice ${path}: ${response.status}`);
  return { status: response.status, body };
};

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const loadOptions = async () => Options.parse((await call("/options")).body);

export const loadLibrary = async () => z.array(LibraryEntry).parse((await call("")).body);

export const generate = async (request: GenerateRequest) => z.object({ id: z.string() }).parse((await call("", post(request))).body).id;

/** The dialogue as a clip to play, or null while it is still being made. */
export const loadPractice = async (id: string): Promise<ClipView | null> => {
  const { status, body } = await call(`/${id}`);
  return status === 202 ? null : ClipView.parse(body);
};

export const answerPractice = async (id: string, answer: AnswerRequest) => AnswerResponse.parse((await call(`/${id}/answer`, post(answer))).body);
