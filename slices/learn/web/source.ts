import { JLPT_LEVELS } from "@mojibun/shared";
import type { Track } from "../contract.ts";

export const SOURCE_LEVELS = [...JLPT_LEVELS, "unlevelled"] as const;
export const SOURCE_TYPES: { type: Track["type"]; label: string }[] = [
  { type: "kanji", label: "Kanji" },
  { type: "word", label: "Words" },
  { type: "grammar_point", label: "Grammar" },
];

/** Where Learn draws from: one level and the Study Item types taken from it. */
export type Source = { level: Track["level"]; types: Track["type"][] };

export const levelOf = (tracks: Track[]): Track["level"] => (tracks[0] ? tracks[0].level : "N5");
export const typesAt = (tracks: Track[], level: Track["level"]) => tracks.filter((t) => t.level === level).map((t) => t.type);
export const sourceOf = (tracks: Track[]): Source => ({ level: levelOf(tracks), types: typesAt(tracks, levelOf(tracks)) });
export const tracksOf = ({ level, types }: Source): Track[] => types.map((type) => ({ level, type }));

/** Another level with the same types. A source with no type takes every type, so one choice is enough to start. */
export const atLevel = (source: Source, level: Track["level"]): Source => ({
  level,
  types: source.types[0] ? source.types : SOURCE_TYPES.map((t) => t.type),
});
export const toggled = (source: Source, type: Track["type"]): Source => ({
  ...source,
  types: source.types.includes(type) ? source.types.filter((t) => t !== type) : [...source.types, type],
});
