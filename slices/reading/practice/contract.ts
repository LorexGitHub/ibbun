import { z } from "zod";
import { JlptLevel } from "@mojibun/shared";
import { TextView } from "../contract.ts";

export { TextView };

/** The fixed topic list of the Generate screen. A Learner picks from it; nothing they type reaches the LLM (listening.md#what-the-learner-chooses). */
export const TOPICS = ["仕事", "旅行", "学校", "家族", "食事", "買い物", "健康", "趣味"] as const;
export const LENGTHS = ["short", "medium", "exam"] as const;
export const ANY = "any";

const BASIC = ["memo", "notice", "email", "diary", "short explanation"] as const;
const N3_TYPES = [...BASIC, "explanation", "short essay (随筆)"] as const;
const ADVANCED = [...N3_TYPES, "commentary (評論)", "argument (主張)"] as const;

/** The JLPT passage types a level offers (research/jlpt-reading-formats.md), besides "any". */
export const PASSAGE_TYPES: Record<JlptLevel, readonly string[]> = { N5: BASIC, N4: BASIC, N3: N3_TYPES, N2: ADVANCED, N1: ADVANCED };

/** What the Generate screen sends: only choices from the lists above. */
export const PracticeRequest = z
  .object({
    level: JlptLevel,
    passageType: z.string(),
    length: z.enum(LENGTHS),
    topic: z.enum(TOPICS).optional(),
  })
  .refine((r) => r.passageType === ANY || PASSAGE_TYPES[r.level].includes(r.passageType), { path: ["passageType"] });
export type PracticeRequest = z.infer<typeof PracticeRequest>;

/** `GET /api/reading/practice/options`: where the Generate screen stands. */
export const PracticeOptions = z.object({
  clearedLevels: z.array(JlptLevel),
  /** Practice Texts the Learner can still generate in this rolling 24 h. */
  remaining: z.number().int().nonnegative(),
});
export type PracticeOptions = z.infer<typeof PracticeOptions>;

/** `POST /api/reading/practice/texts`: read it now, wait in the library, or come back tomorrow. */
export const PracticeResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), id: z.uuid() }),
  z.object({ status: z.literal("waiting") }),
  z.object({ status: z.literal("limit") }),
]);
export type PracticeResult = z.infer<typeof PracticeResult>;

/** One line of the library. `title` is null while the text is still being made or approved. */
export const LibraryEntry = z.object({
  id: z.uuid(),
  level: JlptLevel,
  passageType: z.string(),
  length: z.enum(LENGTHS),
  topic: z.string().nullable(),
  at: z.string(),
  title: z.string().nullable(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;

/** `GET /api/reading/practice/texts`, newest first. */
export const Library = z.object({ texts: z.array(LibraryEntry) });
export type Library = z.infer<typeof Library>;
