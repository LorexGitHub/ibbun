import type { Authoring, CheckedSentence, Failure, MatcherRule, Row, TextItem } from "@ibbun/content-graph/authoring";
import type { Nlp } from "@ibbun/nlp";
import { z } from "zod";
import { checkedSentence, toStoredTokens } from "./checks.ts";
import type { Rec } from "./drafts.ts";

export type PassageLine = { link: Row<"passageContainsSentence">; sentence: Row<"sentence"> };

/** A drafted Reading Passage and its Sentences, reviewed as one unit (content-approval.md#units-of-approval). */
export type PassageUnit = {
  primary: Rec;
  /** The Sentences, then their links; the passage is last so Suspension checks see the others decided. */
  records: Rec[];
  passage: Row<"readingPassage">;
  lines: PassageLine[];
};

/** The passage a request is for (its target), unless it is gone or already decided. */
export const passageUnit = async (a: Authoring, passageId: string): Promise<PassageUnit | undefined> => {
  const [passage] = await a.rows("readingPassage", { id: passageId, approval: "draft", retired: false });
  if (!passage) return undefined;
  const links = (await a.rows("passageContainsSentence", { passageId, retired: false })).sort((x, y) => x.position - y.position);
  const lines = await Promise.all(links.map(async (link) => ({ link, sentence: (await a.rows("sentence", { id: link.sentenceId }))[0]! })));
  const records: Rec[] = [
    ...lines.map(({ sentence }) => ({ table: "sentence" as const, id: sentence.id })),
    ...lines.map(({ link }) => ({ table: "passageContainsSentence" as const, id: link.id })),
    { table: "readingPassage", id: passage.id },
  ];
  return { primary: { table: "readingPassage", id: passage.id }, records, passage, lines };
};

/** The request a run belongs to. */
export const requestOfRun = async (a: Authoring, runId: string) => {
  const [run] = await a.rows("generationRun", { id: runId });
  return (await a.rows("generationRequest", { id: run!.requestId }))[0]!;
};

/** Stores Sudachi's tokens on every Sentence of the passage and returns the Sentences as the checks read them. */
export const tokenise = async (a: Authoring, nlp: Nlp, lines: readonly PassageLine[]): Promise<CheckedSentence[]> => {
  const checked: CheckedSentence[] = [];
  for (const { sentence } of lines) {
    const tokens = toStoredTokens(await nlp.tokenize(sentence.text));
    await a.update("sentence", { id: sentence.id }, { tokens });
    checked.push(await checkedSentence(a, sentence, tokens));
  }
  return checked;
};

const itemOf = async (a: Authoring, id: string): Promise<TextItem | undefined> => {
  const [item] = await a.rows("studyItem", { id });
  if (item?.type === "word") {
    const forms = (await a.rows("wordForm", { wordId: id })).sort((x, y) => x.position - y.position);
    const readings = (await a.rows("wordReading", { wordId: id })).sort((x, y) => x.position - y.position);
    const [lemma, ...spellings] = [...new Set([...forms, ...readings].map((r) => r.text))];
    return lemma ? { type: "word", id, lemma, spellings } : undefined;
  }
  if (item?.type === "kanji") {
    const [kanji] = await a.rows("kanji", { studyItemId: id });
    return kanji && { type: "kanji", id, literal: kanji.literal };
  }
  const [point] = item?.type === "grammar_point" ? await a.rows("grammarPoint", { studyItemId: id }) : [];
  return point?.matcherRule ? { type: "grammar_point", id, rule: point.matcherRule as MatcherRule } : undefined;
};

/** The Study Items as the Learner-aware checks see them. One with nothing to look for (no form, no Matcher Rule) is left out. */
export const textItems = async (a: Authoring, ids: readonly string[]): Promise<TextItem[]> =>
  (await Promise.all(ids.map((id) => itemOf(a, id)))).filter((item): item is TextItem => item !== undefined);

/** How an item is named to the reviewer. */
export const itemLabel = async (a: Authoring, item: TextItem): Promise<string> => {
  if (item.type === "word") return `Word ${item.lemma}`;
  if (item.type === "kanji") return `Kanji ${item.literal}`;
  const [point] = await a.rows("grammarPoint", { studyItemId: item.id });
  return `Grammar Point ${point!.title}`;
};

/** Reads a kind's context off a Generation Request's `reason`: the prefix, then JSON (as content-generation writes it). */
export const contextOf = <S extends z.ZodType>(prefix: string, schema: S, reason: string): z.output<S> | null => {
  if (!reason.startsWith(prefix)) return null;
  const parsed = schema.safeParse((() => { try { return JSON.parse(reason.slice(prefix.length)); } catch { return undefined; } })());
  return parsed.success ? parsed.data : null;
};

export const sentenceLines = (lines: readonly PassageLine[]): string =>
  lines.map(({ link, sentence }) => `${link.speaker ? `${link.speaker}: ` : ""}${sentence.text} (${sentence.translationEn ?? "none"})`).join("\n");

/** A dialogue's 2 questions each have 4 different choices and an answer among them. */
export const questionFailures = (questions: readonly { choices: readonly string[]; answer: number }[]): Failure[] => [
  ...(questions.length === 2 ? [] : [{ check: "questions", message: `There are ${questions.length} questions, not 2.` }]),
  ...questions.flatMap((q, i) =>
    q.choices.length === 4 && new Set(q.choices).size === 4 && q.answer >= 0 && q.answer < 4 ? [] : [{ check: "questions", message: `Question ${i + 1} needs four different choices.` }],
  ),
];

export const questionLines = (questions: readonly { question: string; choices: readonly string[]; answer: number }[]): string =>
  questions
    .map(({ question, choices, answer }, i) => `${i + 1}. ${question}\n   correct: ${choices[answer]}\n   wrong: ${choices.filter((_, j) => j !== answer).join(" / ")}`)
    .join("\n");
