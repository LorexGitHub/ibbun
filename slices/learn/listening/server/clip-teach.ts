import { grade, type AnswerData, type ContentGraph, type Example, type GradeResult, type StudyItemLink, type StudyItemPage } from "@ibbun/content-graph";
import type { StudyItemId } from "@ibbun/shared";
import type { ClipLesson, ClipQuestion } from "../contract.ts";

type Line = Extract<StudyItemLink, { kind: "voices" }>;
type Clip = { id: StudyItemId; lines: Line[]; example: Example };
export type Settings = { examMode: boolean; slowAudio: boolean };

const keyOf = (line: Line) => line.audioKey ?? line.sentence.audio?.key ?? null;

/** A Sentence clip is asked by dictation unless its Example holds a question; a dialogue by comprehension only. */
const askable = (kind: "sentence" | "dialogue", example: Example) => kind === "sentence" || example.comprehensionQuestion !== null;

/** The clip's lines and the Example its quiz asks, or null when it has nothing to play or to ask. */
const clipOf = (page: StudyItemPage | null): Clip | null => {
  if (page?.item.type !== "listening_clip") return null;
  const { id, kind } = page.item;
  const lines = page.links.filter((l): l is Line => l.kind === "voices" && keyOf(l) !== null);
  const example = page.examples.find((e) => askable(kind, e));
  return lines.length > 0 && example ? { id, lines, example } : null;
};

/** Fisher-Yates over a copy. `random` returns [0, 1). */
const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const questionOf = (example: Example, random: () => number): ClipQuestion => {
  const q = example.comprehensionQuestion;
  return q ? { kind: "comprehension", prompt: q.question, choices: shuffled(q.choices, random) } : { kind: "dictation" };
};

/** What a link to a Word or Grammar Point shows: the written form, or the reading of a Word with none. */
const labelOf = ({ item }: StudyItemPage): string =>
  item.type === "word" ? (item.forms[0]?.text ?? item.readings[0]!.text) : item.type === "grammar_point" ? item.title : item.id;

/** The Words and Grammar Points the clip's Sentences link to: its dependencies in `pathItems()`. */
const linksOf = async (graph: ContentGraph, id: StudyItemId) => {
  const clip = (await graph.pathItems()).find((p) => p.id === id)!;
  const pages = await Promise.all(clip.dependsOn.map((d) => graph.studyItem(d)));
  return pages.flatMap((p) => (p ? [{ studyItemId: p.item.id, label: labelOf(p) }] : []));
};

export const audioUrl = (key: string) => `/audio/${key}`;

/** What grades the quiz question: the facet it logs, and the Learner's input run through `grade()`. */
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

/** Reads Listening Clips from the Content Graph as something Learn teaches and quizzes. */
export const createClipTeacher = (graph: ContentGraph, random: () => number = Math.random) => ({
  /** The lesson of a Listening Clip, or null when the Study Item is not one, or has nothing to play or ask. */
  teach: async (id: StudyItemId, settings: Settings): Promise<ClipLesson | null> => {
    const clip = clipOf(await graph.studyItem(id));
    if (!clip) return null;
    return {
      studyItemId: clip.id,
      exampleId: clip.example.id,
      lines: clip.lines.map((l) => ({ speaker: l.speaker, text: l.sentence.text, translationEn: l.sentence.translationEn, src: audioUrl(keyOf(l)!) })),
      links: await linksOf(graph, clip.id),
      question: questionOf(clip.example, random),
      ...settings,
    };
  },
  /** The Example a quiz answer is about, when the clip is one Learn can teach. */
  locate: async (id: StudyItemId, exampleId: string) => {
    const clip = clipOf(await graph.studyItem(id));
    return clip && clip.example.id === exampleId ? clip.example : null;
  },
});

export type ClipTeacher = ReturnType<typeof createClipTeacher>;
