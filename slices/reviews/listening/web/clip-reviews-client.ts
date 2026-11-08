import { call, postJson } from "../../web/http.ts";
import { ClipAnswerResponse, ClipDueResponse, type ClipAnswerRequest } from "../contract.ts";

export type LoadClips = () => Promise<ClipDueResponse>;
export type AnswerClip = (request: ClipAnswerRequest) => Promise<ClipAnswerResponse>;

export const loadDueClips: LoadClips = async () => ClipDueResponse.parse(await call("/listening/due"));

export const answerClip: AnswerClip = async (request) => ClipAnswerResponse.parse(await postJson("/listening/answer", request));
