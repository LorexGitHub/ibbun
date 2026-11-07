import type { Facet, QuizAnswer, QuizPrompt } from "../contract.ts";

/** What the Learner did on one facet of the question in front of them. */
export type Given = { facet: Facet; input: string; passed: boolean; attempts: string[] };

/** The quiz: questions still to ask, the tries that missed so far, and the correct answers so far. */
export type Quiz = {
  queue: QuizPrompt[];
  tries: Record<string, Partial<Record<Facet, string[]>>>;
  answers: QuizAnswer[];
};

export const startQuiz = (queue: QuizPrompt[]): Quiz => ({ queue, tries: {}, answers: [] });

export const isFinished = (quiz: Quiz) => quiz.queue.length === 0;

/**
 * Takes the answer to the question at the front. A fully correct one is kept; a miss goes to the back of the queue,
 * with the tries it took, so it is asked again until it is right.
 */
export const answered = (quiz: Quiz, given: Given[], timeToAnswerMs: number): Quiz => {
  const [prompt, ...rest] = quiz.queue;
  if (!prompt) return quiz;
  const id = prompt.studyItemId;
  const before = quiz.tries[id] ?? {};
  const triesOf = (g: Given, missed: boolean) => [...(before[g.facet] ?? []), ...g.attempts, ...(missed && !g.passed ? [g.input] : [])];
  if (given.every((g) => g.passed)) {
    const facets = given.map((g) => ({ facet: g.facet, input: g.input, attempts: triesOf(g, false) }));
    return { ...quiz, queue: rest, answers: [...quiz.answers, { studyItemId: id, exampleId: prompt.exampleId, facets, timeToAnswerMs }] };
  }
  const tries = { ...before, ...Object.fromEntries(given.map((g) => [g.facet, triesOf(g, true)])) };
  return { ...quiz, queue: [...rest, prompt], tries: { ...quiz.tries, [id]: tries } };
};
