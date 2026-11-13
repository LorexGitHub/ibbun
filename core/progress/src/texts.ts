import { z } from "zod";
import type { DbOrTx } from "@ibbun/db";
import { JlptLevel, LearnerId, StudyItemId, Timestamp } from "@ibbun/shared";

const common = { learnerId: LearnerId, passageId: z.uuid(), at: Timestamp };

/** The Learner's own record of a Batch Text; the passage is in `content-graph` (batch-text.md#storage). */
export const NewBatchText = z.object({
  ...common,
  kind: z.literal("batch"),
  /** The batch's hardest level, Unlevelled counting as hardest. */
  level: z.union([JlptLevel, z.literal("unlevelled")]),
  episode: z.number().int().positive(),
  studyItemIds: z.array(StudyItemId).min(1),
  episodeSummary: z.string(),
  cast: z.array(z.string().min(1)),
});

/** What a Learner generated at a Cleared Level (listening.md#practice-texts). */
export const NewPracticeText = z.object({
  ...common,
  kind: z.literal("practice"),
  level: JlptLevel,
  form: z.enum(["passage", "dialogue"]),
  /** A JLPT passage type or 聴解 task type, or "any". */
  passageType: z.string().min(1),
  length: z.enum(["short", "medium", "exam"]),
  topic: z.string().min(1).optional(),
});

export const NewText = z.discriminatedUnion("kind", [NewBatchText, NewPracticeText]);
export type NewBatchText = z.input<typeof NewBatchText>;
export type NewPracticeText = z.input<typeof NewPracticeText>;
export type NewText = z.input<typeof NewText>;
export type BatchText = z.output<typeof NewBatchText> & { id: string };
export type PracticeText = z.output<typeof NewPracticeText> & { id: string };
export type Text = BatchText | PracticeText;
export type TextKind = Text["kind"];

const DAY_MS = 86_400_000;

/** The `progress` interface for a Learner's Batch Texts and Practice Texts. */
export type Texts = {
  record(text: NewText, tx?: DbOrTx): Promise<Text>;
  /** Oldest first; the last one carries the story on. */
  batchTexts(learnerId: LearnerId, tx?: DbOrTx): Promise<BatchText[]>;
  practiceTexts(learnerId: LearnerId, tx?: DbOrTx): Promise<PracticeText[]>;
  /** How many of one kind the Learner got in the 24 h before `at`, for the per-Learner limits. */
  countLast24h(learnerId: LearnerId, kind: TextKind, at: Date, tx?: DbOrTx): Promise<number>;
};

/** Where Texts keeps its records. Reads are oldest first. */
export type TextStore = {
  append(text: Text, tx?: DbOrTx): Promise<void>;
  read(learnerId: LearnerId, kind: TextKind, tx?: DbOrTx): Promise<Text[]>;
};

export const createTextsOver = (store: TextStore, newId: () => string): Texts => ({
  async record(input, tx) {
    const parsed = NewText.parse(input);
    const text = { ...parsed, at: new Date(parsed.at).toISOString(), id: newId() };
    await store.append(text, tx);
    return text;
  },
  batchTexts: async (learnerId, tx) => (await store.read(learnerId, "batch", tx)) as BatchText[],
  practiceTexts: async (learnerId, tx) => (await store.read(learnerId, "practice", tx)) as PracticeText[],
  async countLast24h(learnerId, kind, at, tx) {
    const from = at.getTime() - DAY_MS;
    return (await store.read(learnerId, kind, tx)).filter((t) => Date.parse(t.at) > from && Date.parse(t.at) <= at.getTime())
      .length;
  },
});
