import type { JlptLevel } from "@mojibun/shared";
import { levelQuery } from "@mojibun/ui";
import { call, postJson } from "../../web/http.ts";
import { ClipAnswerResponse, ClipDueResponse, type ClipAnswerRequest } from "../contract.ts";

export type LoadClips = (level?: JlptLevel) => Promise<ClipDueResponse>;
export type AnswerClip = (request: ClipAnswerRequest) => Promise<ClipAnswerResponse>;

export const loadDueClips: LoadClips = async (level) => ClipDueResponse.parse(await call(`/listening/due${levelQuery(level)}`));

export const answerClip: AnswerClip = async (request) => ClipAnswerResponse.parse(await postJson("/listening/answer", request));
