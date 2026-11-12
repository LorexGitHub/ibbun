import type { JlptLevel } from "@mojibun/shared";
import type { LevelPage, Mastery } from "../contract.ts";

const slug = (level: JlptLevel) => level.toLowerCase();

/** A level's own page, as the shell's top line links to it. */
export const levelHref = (level: JlptLevel) => `/level/${slug(level)}`;

/** The three rows of progress on a level's page. */
export const TRACKS: { label: string; of: (page: LevelPage) => Mastery }[] = [
  { label: "Kanji", of: (page) => page.kanji },
  { label: "Words", of: (page) => page.word },
  { label: "Grammar", of: (page) => page.grammarPoint },
];

export type Door = { label: string; glyph: string; href: string; note: string };

const left = (page: LevelPage) => TRACKS.map((t) => t.of(page)).reduce((sum, m) => sum + m.total - m.known, 0);

const clipsNote = (clips: number) => (clips === 1 ? "1 clip" : clips ? `${clips} clips` : "no clips yet");

/** What a Learner can open from a level's page, each for that level, with what waits behind it. */
export const levelDoors = (page: LevelPage): Door[] => {
  const toLearn = left(page);
  const at = `?level=${slug(page.level)}`;
  return [
    { label: "Reviews", glyph: "復", href: `/reviews${at}`, note: page.due ? `${page.due} due` : "nothing due" },
    { label: "Learn", glyph: "新", href: `/learn${at}`, note: toLearn ? `${toLearn} not yet Known` : "all Known" },
    { label: "Reading", glyph: "読", href: `/reading${at}`, note: "Short texts built from what you know" },
    { label: "Listening", glyph: "聞", href: `/listening${at}`, note: clipsNote(page.clips) },
    { label: "Placement", glyph: "測", href: `/placement${at}`, note: "Mark what you already know" },
  ];
};
