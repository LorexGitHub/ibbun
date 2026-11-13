import type { JlptLevel } from "@ibbun/shared";
import { CHARACTERS_PER_EARLIER_ITEM, LENGTHS, PASSAGE_TYPES, UNLEVELLED_BAND_SIZE, UNLEVELLED_BANDS } from "./config.ts";

export type BatchLevel = JlptLevel | "unlevelled";

/** The passage type of an episode; types repeat only after the whole list has been used (batch-text.md#style). */
export const passageType = (level: BatchLevel, episode: number): string => {
  const types = PASSAGE_TYPES[level];
  return types[(episode - 1) % types.length]!;
};

/**
 * Characters to aim for. `progress` is 0 to 1 for a levelled batch (the share of the level's Study Items met in Learn);
 * for an Unlevelled batch it is the number of Unlevelled items met (batch-text.md#length).
 */
export const targetLength = (level: BatchLevel, progress: number): number => {
  if (level === "unlevelled") {
    const band = Math.min(Math.floor(progress / UNLEVELLED_BAND_SIZE), UNLEVELLED_BANDS - 1);
    return along(LENGTHS.N1, band / (UNLEVELLED_BANDS - 1));
  }
  return along(LENGTHS[level], progress);
};

const along = ({ shortest, longest }: { shortest: number; longest: number }, share: number) =>
  Math.round(shortest + (longest - shortest) * Math.min(Math.max(share, 0), 1));

export const earlierItemCount = (length: number): number => Math.round(length / CHARACTERS_PER_EARLIER_ITEM);
