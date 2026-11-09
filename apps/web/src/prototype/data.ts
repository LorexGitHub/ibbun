// PROTOTYPE: throwaway. Reads the real Today API; falls back to sample data when logged out.
import { useEffect, useState } from "react";

export type TodayData = {
  due: { total: number; kanji: number; word: number; grammarPoint: number };
  streakDays: number;
  levels: { level: string; known: number; total: number }[];
};

const SAMPLE: TodayData = {
  due: { total: 18, kanji: 11, word: 5, grammarPoint: 2 },
  streakDays: 42,
  levels: [
    { level: "N5", known: 563, total: 612 },
    { level: "N4", known: 238, total: 580 },
    { level: "N3", known: 41, total: 690 },
    { level: "N2", known: 0, total: 1020 },
    { level: "N1", known: 0, total: 1400 },
  ],
};

export const useToday = () => {
  const [state, setState] = useState<{ today: TodayData; sample: boolean } | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("sample")) return setState({ today: SAMPLE, sample: true });
    fetch("/api/dashboard/today", { credentials: "same-origin" })
      .then(async (r) => (r.ok ? setState({ today: (await r.json()) as TodayData, sample: false }) : setState({ today: SAMPLE, sample: true })))
      .catch(() => setState({ today: SAMPLE, sample: true }));
  }, []);
  return state;
};

export const pct = (l: { known: number; total: number }) => (l.total ? Math.round((l.known / l.total) * 100) : 0);

/** The level the Learner is working on: the first under 90%. */
export const currentLevel = (levels: TodayData["levels"]) => levels.find((l) => pct(l) < 90) ?? levels.at(-1)!;

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export const breakdown = ({ kanji, word, grammarPoint }: TodayData["due"]) =>
  [
    { label: "Kanji", n: kanji },
    { label: "Words", n: word },
    { label: "Grammar", n: grammarPoint },
  ];
