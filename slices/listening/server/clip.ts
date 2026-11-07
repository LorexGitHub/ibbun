import { grade, type AnswerData, type Example, type GradeResult, type StudyItemLink, type StudyItemPage } from "@mojibun/content-graph";
import type { ClipView, Question, Transcript } from "../contract.ts";

/** One audio-bearing line of a clip: a dialogue has many, a Sentence clip has one. */
type Line = Extract<StudyItemLink, { kind: "voices" }>;

/** A Listening Clip the Learner can be asked: its lines to play and the Examples that can be asked of it. */
export type Playable = { clipId: string; lines: Line[]; examples: Example[] };

export const audioUrl = (key: string) => `/audio/${key}`;

const keyOf = (line: Line) => line.audioKey ?? line.sentence.audio?.key ?? null;

/** A dialogue is asked by comprehension only; a Sentence clip by dictation unless its Example holds a question. */
const askable = (kind: "sentence" | "dialogue", example: Example) => kind === "sentence" || example.comprehensionQuestion !== null;

/** The clip as a Learner can practise it, or null when it has nothing to play or nothing to ask. */
export const playable = (page: StudyItemPage | null): Playable | null => {
  if (page?.item.type !== "listening_clip") return null;
  const { id, kind } = page.item;
  const lines = page.links.filter((l): l is Line => l.kind === "voices" && keyOf(l) !== null);
  const examples = page.examples.filter((e) => askable(kind, e));
  return lines.length > 0 && examples.length > 0 ? { clipId: id, lines, examples } : null;
};

/** Each Review rotates to the next Example, so a dialogue's two questions alternate. */
export const nextExample = ({ examples }: Playable, answered: number): Example => examples[answered % examples.length]!;

/** Fisher-Yates over a copy. `random` returns [0, 1). */
export const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const questionOf = (example: Example, random: () => number): Question => {
  const q = example.comprehensionQuestion;
  return q ? { kind: "comprehension", prompt: q.question, choices: shuffled(q.choices, random) } : { kind: "dictation" };
};

export const viewOf = (clip: Playable, example: Example, settings: { examMode: boolean; slowAudio: boolean }, random: () => number): ClipView => ({
  clipId: clip.clipId,
  exampleId: example.id,
  audio: clip.lines.map((l) => ({ src: audioUrl(keyOf(l)!), speaker: l.speaker })),
  question: questionOf(example, random),
  examMode: settings.examMode,
  slowAudio: settings.slowAudio,
});

export const transcriptOf = (clip: Playable): Transcript =>
  clip.lines.map((l) => ({ speaker: l.speaker, text: l.sentence.text, translation: l.sentence.translationEn, audio: audioUrl(keyOf(l)!) }));

/** What the grader needs and how to feed it the Learner's input. */
export type Grading = { facet: "dictation" | "comprehension"; run: (input: string) => GradeResult; correctChoice?: string };

export const gradingOf = (example: Example): Grading => {
  const q = example.comprehensionQuestion;
  if (q) {
    const data: AnswerData = { facet: "comprehension", answer: q.answer, choiceCount: q.choices.length };
    return { facet: "comprehension", run: (input) => grade(data, q.choices.indexOf(input)), correctChoice: q.choices[q.answer] };
  }
  const data: AnswerData = { facet: "dictation", tokens: example.sentence.tokens.map(({ surface, reading }) => ({ surface, reading })) };
  return { facet: "dictation", run: (input) => grade(data, input) };
};
