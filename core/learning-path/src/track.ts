import { z } from "zod";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";
import type { PathItem } from "@mojibun/content-graph";

export const TRACK_TYPES = ["kanji", "word", "grammar_point", "listening_clip"] as const;
export type TrackType = (typeof TRACK_TYPES)[number];
export const TRACK_LEVELS = [...JLPT_LEVELS, "unlevelled"] as const;
export type TrackLevel = (typeof TRACK_LEVELS)[number];

/** One Study Item type at one JLPT Level, or Unlevelled. */
export const Track = z.object({ level: z.enum(TRACK_LEVELS), type: z.enum(TRACK_TYPES) });
export type Track = z.infer<typeof Track>;

/** All 24 Tracks, easiest level first, then Kanji, Words, Grammar, Listening. */
export const TRACKS: Track[] = TRACK_LEVELS.flatMap((level) => TRACK_TYPES.map((type) => ({ level, type })));

export const trackKey = (t: Track) => `${t.level}:${t.type}`;
export const trackOf = (level: JlptLevel | null, type: TrackType): Track => ({ level: level ?? "unlevelled", type });
export const trackOfItem = (item: PathItem) => trackOf(item.level, item.type);
export const parseTrackKey = (key: string): Track => {
  const [level, type] = key.split(":");
  return Track.parse({ level, type });
};

/** In TRACKS order, without duplicates. */
export const normaliseTracks = (tracks: Track[]): Track[] => {
  const keys = new Set(tracks.map((t) => trackKey(Track.parse(t))));
  return TRACKS.filter((t) => keys.has(trackKey(t)));
};

/** What a new Learner starts with: the four N5 Tracks. */
export const DEFAULT_ACTIVE_TRACKS: Track[] = TRACKS.filter((t) => t.level === "N5");
