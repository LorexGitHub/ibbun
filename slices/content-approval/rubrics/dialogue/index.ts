import type { Authoring, Failure, Level, Row } from "@ibbun/content-graph/authoring";
import { currentLevel } from "@ibbun/content-graph/levels";
import type { Nlp } from "@ibbun/nlp";
import { toStoredTokens } from "../../src/checks.ts";
import type { Rec } from "../../src/drafts.ts";
import { questionFailures, questionLines } from "../../src/passages.ts";

type Line = { line: Row<"clipVoicesSentence">; sentence: Row<"sentence"> };

/**
 * A drafted listening dialogue: the clip, its Sentences and its 2 comprehension questions, reviewed as one unit
 * (content-approval.md#units-of-approval). The voiced lines are approved later, with their audio.
 */
export type DialogueDraft = {
  kind: "dialogue";
  primary: Rec;
  /** The Sentences, then the questions; the clip is last so Suspension checks see the others decided. */
  records: Rec[];
  grammarPoint: Row<"grammarPoint">;
  lines: Line[];
  questions: Row<"example">[];
};

export type DialogueCheck = { failures: Failure[]; level: Level };

/** The clip a dialogue run wrote: its Study Item takes the Generation Request's id. Nothing once it is decided. */
export const dialogueDrafts = async (a: Authoring, runId: string): Promise<DialogueDraft[]> => {
  const [run] = await a.rows("generationRun", { id: runId });
  const [request] = await a.rows("generationRequest", { id: run!.requestId });
  const [clip] = await a.rows("studyItem", { id: request!.id, type: "listening_clip", approval: "draft", retired: false });
  const [grammarPoint] = await a.rows("grammarPoint", { studyItemId: request!.targetId });
  if (!clip || !grammarPoint) return [];
  const voiced = (await a.rows("clipVoicesSentence", { clipId: clip.id, retired: false })).sort((x, y) => x.position - y.position);
  const lines = await Promise.all(voiced.map(async (line) => ({ line, sentence: (await a.rows("sentence", { id: line.sentenceId }))[0]! })));
  const questions = await a.rows("example", { studyItemId: clip.id, retired: false });
  const records: Rec[] = [
    ...lines.map(({ sentence }) => ({ table: "sentence" as const, id: sentence.id })),
    ...questions.map((q) => ({ table: "example" as const, id: q.id })),
    { table: "studyItem", id: clip.id },
  ];
  return [{ kind: "dialogue", primary: { table: "studyItem", id: clip.id }, records, grammarPoint, lines, questions }];
};

/** Stores Sudachi's tokens on every line (audio is built from them), then checks that both speakers talk and each question is well formed. */
export const checkDialogue = async (a: Authoring, nlp: Nlp, draft: DialogueDraft): Promise<DialogueCheck> => {
  for (const { sentence } of draft.lines) await a.update("sentence", { id: sentence.id }, { tokens: toStoredTokens(await nlp.tokenize(sentence.text)) });
  const speakers = new Set(draft.lines.map(({ line }) => line.speaker));
  const turns = speakers.size === 2 ? [] : [{ check: "speaker-turns", message: "Both 男 and 女 must speak." }];
  const level = currentLevel(await a.rows("levelCandidate", { studyItemId: draft.grammarPoint.studyItemId }));
  return { failures: [...turns, ...questionFailures(draft.questions.map((q) => q.comprehensionQuestion ?? { question: "", choices: [], answer: -1 }))], level };
};

/** The values the rubric template needs. */
export const dialogueValues = ({ grammarPoint, lines, questions }: DialogueDraft, check: DialogueCheck): Record<string, string> => ({
  level: check.level ?? "Unlevelled",
  grammarPoint: grammarPoint.title,
  lineCount: String(lines.length),
  lines: lines.map(({ line, sentence }) => `${line.speaker}: ${sentence.text} (${sentence.translationEn ?? "none"})`).join("\n"),
  questions: questionLines(questions.map((q) => q.comprehensionQuestion!)),
});
