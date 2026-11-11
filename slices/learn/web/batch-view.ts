import type { BatchItem, QuizPrompt } from "../contract.ts";

export type Taught = Extract<BatchItem, { lesson: unknown }>;
export const isTaught = (item: BatchItem): item is Taught => "lesson" in item;

const TYPE_LABEL = { kanji: "Kanji", word: "Word", grammar_point: "Grammar Point" } as const;

/** A Study Item as a card shows it before it is taught: its Japanese and its type, nothing that gives it away. */
export type Face = { id: string; title: string; type: string };
export const faceOf = (item: BatchItem): Face =>
  isTaught(item)
    ? { id: item.lesson.studyItemId, title: item.lesson.title, type: TYPE_LABEL[item.lesson.type] }
    : { id: item.clip.studyItemId, title: "音声", type: "Listening Clip" };

/** The Kanji taught inside their Example instead of alone: every other one, from the first. */
export const sentenceFirst = (items: BatchItem[]): Set<string> =>
  new Set(
    items
      .filter(isTaught)
      .filter((i) => i.lesson.type === "kanji")
      .filter((_, n) => n % 2 === 0)
      .map((i) => i.lesson.studyItemId),
  );

/** How the target is read in its sentence, when the prompt asks for a reading. */
export const readingIn = (prompt: QuizPrompt): string | undefined =>
  prompt.facets.flatMap((f) => (f.answerData.facet === "japanese" ? f.answerData.accepted.flatMap((a) => (a.reading ? [a.reading] : [])) : []))[0];

/** What the batch quiz asks: every taught item the Learner did not mark as Known. */
export const quizOf = (items: BatchItem[], known: string[]): QuizPrompt[] =>
  items
    .filter(isTaught)
    .filter((i) => !known.includes(i.lesson.studyItemId))
    .map((i) => i.prompt);

/** No lesson is left at `at` and nothing waits for the quiz: clips and items marked as Known need none. */
export const isOver = (items: BatchItem[], at: number, known: string[]) => !items[at] && quizOf(items, known).length === 0;

/** What a finished batch came to: how many items went into Reviews, and each item with how it was settled. */
export type Tally = { learned: number; items: (Face & { known: boolean })[] };
export const tallyOf = (items: BatchItem[], known: string[], learned: number): Tally => ({
  learned,
  items: items.map(faceOf).map((face) => ({ ...face, known: known.includes(face.id) })),
});
