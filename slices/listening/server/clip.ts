import { grade, type ComprehensionQuestion, type Example, type GradeResult, type StudyItemLink, type StudyItemPage } from "@ibbun/content-graph";
import type { ClipView, Question, Transcript } from "../contract.ts";

/** One audio-bearing line of a clip: a dialogue has many, a Sentence clip has one. */
type Line = Extract<StudyItemLink, { kind: "voices" }>;

/** An Example that holds a question. Only these are asked: the Listening screen has no dictation. */
export type Asked = Example & { comprehensionQuestion: ComprehensionQuestion };

/** A Listening Clip the Learner can be asked: its lines to play and the Examples that can be asked of it. */
export type Playable = { clipId: string; lines: Line[]; examples: Asked[] };

export const audioUrl = (key: string) => `/audio/${key}`;

const keyOf = (line: Line) => line.audioKey ?? line.sentence.audio?.key ?? null;

const askable = (example: Example): example is Asked => example.comprehensionQuestion !== null;

/** The clip as a Learner can practise it, or null when it has nothing to play or nothing to ask. */
export const playable = (page: StudyItemPage | null): Playable | null => {
  if (page?.item.type !== "listening_clip") return null;
  const { id } = page.item;
  const lines = page.links.filter((l): l is Line => l.kind === "voices" && keyOf(l) !== null);
  const examples = page.examples.filter(askable);
  return lines.length > 0 && examples.length > 0 ? { clipId: id, lines, examples } : null;
};

/** Each Review rotates to the next Example, so a dialogue's two questions alternate. */
export const nextExample = ({ examples }: Playable, answered: number): Asked => examples[answered % examples.length]!;

/** Fisher-Yates over a copy. `random` returns [0, 1). */
export const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const questionOf = ({ comprehensionQuestion: q }: Asked, random: () => number): Question => ({ prompt: q.question, choices: shuffled(q.choices, random) });

export const viewOf = (clip: Playable, example: Asked, settings: { examMode: boolean; slowAudio: boolean }, random: () => number): ClipView => ({
  clipId: clip.clipId,
  exampleId: example.id,
  audio: clip.lines.map((l) => ({ src: audioUrl(keyOf(l)!), speaker: l.speaker })),
  question: questionOf(example, random),
  examMode: settings.examMode,
  slowAudio: settings.slowAudio,
});

export const transcriptOf = (clip: Playable): Transcript =>
  clip.lines.map((l) => ({ speaker: l.speaker, text: l.sentence.text, translation: l.sentence.translationEn, audio: audioUrl(keyOf(l)!) }));

/** How to grade the option the Learner chose, and the option that was right. */
export type Grading = { run: (input: string) => GradeResult; correctChoice: string };

export const gradingOf = ({ comprehensionQuestion: q }: Asked): Grading => ({
  run: (input) => grade({ facet: "comprehension", answer: q.answer, choiceCount: q.choices.length }, q.choices.indexOf(input)),
  correctChoice: q.choices[q.answer]!,
});
