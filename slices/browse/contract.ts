import { z } from "zod";
import { JlptLevel, StudyItemId } from "@ibbun/shared";

export { JlptLevel };

export const BrowseType = z.enum(["kanji", "word", "grammar_point"]);
export type BrowseType = z.infer<typeof BrowseType>;

/** One line of a level list or a search result. `level` null means Unlevelled. */
export const Summary = z.object({
  id: StudyItemId,
  type: BrowseType,
  level: JlptLevel.nullable(),
  label: z.string(),
  reading: z.string().nullable(),
  meaning: z.string().nullable(),
});
export type Summary = z.infer<typeof Summary>;

/** Where the Learner stands with a Study Item. One they have not been taught is New. */
export const Mastery = z.enum(["new", "learning", "young", "mature", "relearning"]);
export type Mastery = z.infer<typeof Mastery>;

/** One tile of the Mastery wall. */
export const Tile = Summary.extend({ mastery: Mastery });
export type Tile = z.infer<typeof Tile>;

/** `GET /api/browse/levels/:level`: every visible Study Item at the level, with the Learner's Mastery of each. */
export const LevelList = z.object({ level: JlptLevel, items: z.array(Tile) });
export type LevelList = z.infer<typeof LevelList>;

/** `GET /api/browse/search?q=` */
export const SearchResults = z.object({ query: z.string(), items: z.array(Summary) });
export type SearchResults = z.infer<typeof SearchResults>;

/** A credit already computed from Provenance and ready to print (docs/licensing.md). */
export const Credit = z.object({ text: z.string(), href: z.string().optional() });
export type Credit = z.infer<typeof Credit>;

const Kanji = z.object({
  type: z.literal("kanji"),
  literal: z.string(),
  meanings: z.array(z.string()),
  onReadings: z.array(z.string()),
  kunReadings: z.array(z.string()),
  grade: z.number().int().nullable(),
  strokeCount: z.number().int(),
  components: z.array(z.string()),
});

const Word = z.object({
  type: z.literal("word"),
  forms: z.array(z.string()),
  usuallyKana: z.boolean(),
  readings: z.array(z.object({ text: z.string(), pitchAccent: z.array(z.number().int()).nullable() })),
  senses: z.array(z.object({ partsOfSpeech: z.array(z.string()), glosses: z.array(z.string()), japaneseExplanation: z.string().nullable() })),
});

const GrammarPoint = z.object({
  type: z.literal("grammar_point"),
  title: z.string(),
  forms: z.array(z.object({ text: z.string(), register: z.enum(["casual", "polite"]) })),
  formation: z.array(z.string()),
  register: z.enum(["casual", "neutral", "polite", "formal"]),
  meaning: z.string(),
  japaneseExplanation: z.string().nullable(),
  notes: z.string().nullable(),
});

export const Detail = z.discriminatedUnion("type", [Kanji, Word, GrammarPoint]);
export type Detail = z.infer<typeof Detail>;

export const Example = z.object({
  id: z.string(),
  text: z.string(),
  translation: z.string().nullable(),
  credits: z.array(Credit),
});
export type Example = z.infer<typeof Example>;

/** Study Items a page links to, under a heading such as "Kanji in this word". `note` explains the link. */
export const Related = z.object({
  heading: z.string(),
  items: z.array(z.object({ summary: Summary, note: z.string().nullable() })),
});
export type Related = z.infer<typeof Related>;

export const ItemPage = z.object({
  id: StudyItemId,
  level: JlptLevel.nullable(),
  /** From `learning-path`'s `isLocked()`. There is no position number: each Learner's order differs. */
  locked: z.boolean(),
  /** Already introduced (by Learn or placement), so Learn now has nothing to offer. */
  introduced: z.boolean(),
  detail: Detail,
  examples: z.array(Example),
  related: z.array(Related),
  credits: z.array(Credit),
});
export type ItemPage = z.infer<typeof ItemPage>;

/** A Retired Word with a successor answers with this instead of a page; the screen navigates to it. */
export const Redirect = z.object({ redirectTo: StudyItemId });
export type Redirect = z.infer<typeof Redirect>;

/** `GET /api/browse/items/:id` */
export const ItemResponse = z.union([ItemPage, Redirect]);
export type ItemResponse = z.infer<typeof ItemResponse>;
