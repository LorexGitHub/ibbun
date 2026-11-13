import { AnswerResponse, ClipList, ClipView, type AnswerRequest } from "../contract.ts";
import type { JlptLevel } from "@ibbun/shared";

const BASE = "/api/listening";

const fetchJson = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`listening ${path}: ${response.status}`);
  return response.json();
};

export const listClips = async (level: JlptLevel) => ClipList.parse(await fetchJson(`/clips?level=${level}`));

export const loadClip = async (clipId: string) => ClipView.parse(await fetchJson(`/clips/${clipId}`));

export const answerClip = async (clipId: string, answer: AnswerRequest) =>
  AnswerResponse.parse(
    await fetchJson(`/clips/${clipId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer),
    }),
  );
