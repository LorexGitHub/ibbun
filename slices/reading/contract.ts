import { z } from "zod";
import { JlptLevel, StudyItemId } from "@mojibun/shared";

export { JlptLevel };

/** A batch's level, Unlevelled counting as hardest (batch-text.md). */
export const TextLevel = z.union([JlptLevel, z.literal("unlevelled")]);
export type TextLevel = z.infer<typeof TextLevel>;

/** One past Batch Text, as a line of a level's episode list. */
export const Episode = z.object({ id: z.uuid(), episode: z.number().int().positive(), title: z.string(), at: z.string() });
export type Episode = z.infer<typeof Episode>;

/** `GET /api/reading/episodes`: the Learner's ready Batch Texts, one list per level, in episode order. */
export const EpisodeLists = z.object({ levels: z.array(z.object({ level: TextLevel, episodes: z.array(Episode) })) });
export type EpisodeLists = z.infer<typeof EpisodeLists>;

/** A run of a Sentence. `reading` is set only where the Learner's furigana setting asks for it. */
export const Run = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  /** The Word a tap looks up; null for particles, punctuation and Words nobody linked. */
  wordId: StudyItemId.nullable(),
  /** The run is a Word of this Batch Text's batch. */
  inBatch: z.boolean(),
});
export type Run = z.infer<typeof Run>;

export const SentenceView = z.object({ id: z.uuid(), runs: z.array(Run), translation: z.string().nullable() });
export type SentenceView = z.infer<typeof SentenceView>;

export const Credit = z.object({ text: z.string(), href: z.string().optional() });

/** `GET /api/reading/batch-texts/:id` and `GET /api/reading/passages/:id`. */
export const TextView = z.object({
  title: z.string(),
  /** Set for a Batch Text; null for a plain Reading Passage. */
  episode: z.object({ level: TextLevel, number: z.number().int().positive() }).nullable(),
  sentences: z.array(SentenceView),
  credits: z.array(Credit),
});
export type TextView = z.infer<typeof TextView>;

/** `POST /api/reading/lookups`: the Learner tapped a Word. */
export const LookupRequest = z.object({ wordId: StudyItemId });
export type LookupRequest = z.infer<typeof LookupRequest>;

export const LookupView = z.object({
  label: z.string(),
  reading: z.string().nullable(),
  meanings: z.array(z.string()),
});
export type LookupView = z.infer<typeof LookupView>;
