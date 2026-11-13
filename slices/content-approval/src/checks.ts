import {
  checkExampleSentence,
  checkJapaneseExplanation,
  readingDisagreement,
  type CheckedSentence,
  type ExampleTarget,
  type Failure,
  type KanjiFacts,
  type Level,
  type LinkedToken,
  type MatcherRule,
  type Span,
  type ReadingDisagreement,
} from "@ibbun/content-graph/authoring";
import { currentLevel } from "@ibbun/content-graph/levels";
import type { Authoring, Row } from "@ibbun/content-graph/authoring";
import type { Nlp, Token as NlpToken } from "@ibbun/nlp";
import type { JlptLevel } from "@ibbun/shared";
import type { ApprovalConfig } from "./config.ts";
import type { ExampleDraft, ExplanationDraft } from "./drafts.ts";

type StoredToken = Row<"sentence">["tokens"][number];

/** Sudachi's tokens with the offsets and field names the Content Graph stores (so grading never calls NLP). */
export const toStoredTokens = (tokens: readonly NlpToken[]): StoredToken[] => {
  let start = 0;
  return tokens.map((t) => {
    const stored = {
      surface: t.surface,
      reading: t.reading,
      lemma: t.lemma,
      partOfSpeech: [...t.partOfSpeech],
      conjugationForm: t.conjugation ? t.conjugation.form : null,
      start,
      end: start + t.surface.length,
    };
    start = stored.end;
    return stored;
  });
};

const visible = (row: { approval: string; retired: boolean }) => row.approval === "approved" && !row.retired;

export const levelOf = async (a: Authoring, studyItemId: string): Promise<Level> =>
  currentLevel(await a.rows("levelCandidate", { studyItemId }));

/** Links each token to the approved JMdict Word whose written form or reading is its lemma. */
const linkTokens = async (a: Authoring, tokens: StoredToken[]): Promise<LinkedToken[]> => {
  const wordIdFor = async (lemma: string): Promise<string | undefined> => {
    const forms = (await a.rows("wordForm", { text: lemma })).filter(visible);
    const readings = forms.length ? [] : (await a.rows("wordReading", { text: lemma })).filter(visible);
    return [...forms, ...readings][0]?.wordId;
  };
  return Promise.all(
    tokens.map(async (token) => {
      const wordId = await wordIdFor(token.lemma);
      return { ...token, word: wordId ? { id: wordId, level: await levelOf(a, wordId) } : null };
    }),
  );
};

const linkedGrammar = async (a: Authoring, sentenceId: string) =>
  Promise.all(
    (await a.rows("sentenceDemonstratesGrammar", { sentenceId })).map(async ({ grammarPointId }) => ({
      id: grammarPointId,
      level: await levelOf(a, grammarPointId),
    })),
  );

export type ExampleCheck = {
  failures: Failure[];
  readingDisagreements: ReadingDisagreement[];
  tokens: StoredToken[];
  level: JlptLevel;
};

const grammarTarget = async (a: Authoring, id: string, level: JlptLevel, span: Span): Promise<ExampleTarget> => {
  const [point] = await a.rows("grammarPoint", { studyItemId: id });
  if (!point?.matcherRule) throw new Error(`Grammar Point ${id} has no Matcher Rule`);
  return { type: "grammar_point", rule: point.matcherRule as MatcherRule, level, span };
};

const targetOf = async (a: Authoring, { example }: ExampleDraft, level: JlptLevel): Promise<ExampleTarget> => {
  const span = { start: example.spanStart, end: example.spanEnd };
  const [item] = await a.rows("studyItem", { id: example.studyItemId });
  if (item?.type === "word") return { type: "word", wordId: item.id, level, span };
  if (item?.type === "grammar_point") return grammarTarget(a, item.id, level, span);
  throw new Error(`no automatic checks for Examples of a ${item ? item.type : "missing"} Study Item`);
};

/** The generator's reading for the target is its accepted answer's reading; Sudachi's is the span's tokens. */
const spanReading = (draft: ExampleDraft, sentence: CheckedSentence): ReadingDisagreement | null => {
  const generator = draft.answers.find((x) => x.kind === "accepted")?.reading;
  const inSpan = sentence.tokens.filter((t) => t.start >= draft.example.spanStart && t.end <= draft.example.spanEnd);
  return generator ? readingDisagreement({ ...sentence, tokens: inSpan }, generator) : null;
};

/** Tokenises an Example's Sentence and runs the Sentence checks over the stored tokens. */
export const checkExample = async (a: Authoring, nlp: Nlp, config: ApprovalConfig, draft: ExampleDraft): Promise<ExampleCheck> => {
  const tokens = toStoredTokens(await nlp.tokenize(draft.sentence.text));
  const { sentence, example } = draft;
  const checked: CheckedSentence = {
    text: sentence.text,
    translationEn: sentence.translationEn,
    tokens: await linkTokens(a, tokens),
    grammar: await linkedGrammar(a, sentence.id),
  };
  const own = await levelOf(a, example.studyItemId);
  const level = own === null ? "N1" : own;
  const existing = (await a.rows("sentence")).filter((s) => visible(s) && s.id !== sentence.id).map((s) => s.text);
  // The whole-Sentence reading check does not apply: the generator gives a reading for the target only (see spanReading).
  const { failures } = checkExampleSentence({ sentence: checked, generatorReading: "" }, await targetOf(a, draft, level), existing, config);
  const disagreement = spanReading(draft, checked);
  return { failures, readingDisagreements: disagreement ? [disagreement] : [], tokens, level };
};

const KANJI = /\p{Script=Han}/u;
/** KANJIDIC2 grades 1–8 are the jōyō Kanji (docs/jlpt-levels.md). */
const isJoyo = (grade: number | null) => grade !== null && grade >= 1 && grade <= 8;

const kanjiFacts = async (a: Authoring, text: string): Promise<Map<string, KanjiFacts>> => {
  const used = new Set([...text].filter((ch) => KANJI.test(ch)));
  const known = (await a.rows("kanji")).filter((k) => used.has(k.literal));
  const facts = new Map<string, KanjiFacts>();
  for (const row of known) facts.set(row.literal, { level: await levelOf(a, row.studyItemId), joyo: isJoyo(row.grade) });
  return facts;
};

type ExplanationTarget = { headwords: string[]; meaning: string; itemId: string };

const WIKTIONARY = "wiktionary-ja";

const grammarExplanationTarget = async (a: Authoring, id: string): Promise<ExplanationTarget> => {
  const [point] = await a.rows("grammarPoint", { studyItemId: id });
  if (!point) throw new Error(`no Grammar Point ${id}`);
  return { headwords: [point.title, ...point.forms.map((f) => f.text)], meaning: point.meaning, itemId: id };
};

const senseExplanationTarget = async (a: Authoring, senseId: string): Promise<ExplanationTarget> => {
  const [sense] = await a.rows("wordSense", { id: senseId });
  if (!sense) throw new Error(`no Word sense ${senseId}`);
  const forms = (await a.rows("wordForm", { wordId: sense.wordId })).map((f) => f.text);
  const readings = (await a.rows("wordReading", { wordId: sense.wordId })).map((r) => r.text);
  return { headwords: [...forms, ...readings], meaning: sense.glosses.join("; "), itemId: sense.wordId };
};

/** The headwords an explanation must not use, and the target's English meaning and Study Item. */
const explanationTarget = (a: Authoring, { explanation }: ExplanationDraft): Promise<ExplanationTarget> => {
  if (explanation.grammarPointId) return grammarExplanationTarget(a, explanation.grammarPointId);
  if (explanation.wordSenseId) return senseExplanationTarget(a, explanation.wordSenseId);
  throw new Error(`Japanese Explanation ${explanation.id} explains nothing`);
};

const fromWiktionary = async (a: Authoring, provenanceId: string): Promise<boolean> => {
  const [provenance] = await a.rows("provenance", { id: provenanceId });
  if (provenance?.source.kind !== "import") return false;
  const [run] = await a.rows("importRun", { id: provenance.source.importRunId });
  return run?.dataset === WIKTIONARY;
};

/** The ja Wiktionary entries for the target, kept for the reviewer to compare the draft with. */
const wiktionaryReferences = async (a: Authoring, { explanation }: ExplanationDraft): Promise<string[]> => {
  const mine = explanation.grammarPointId ? { grammarPointId: explanation.grammarPointId } : { wordSenseId: explanation.wordSenseId! };
  const found: string[] = [];
  for (const e of await a.rows("japaneseExplanation", mine)) {
    if (e.id !== explanation.id && e.approval !== "rejected" && !e.retired && (await fromWiktionary(a, e.provenanceId))) found.push(e.text);
  }
  return found;
};

export type ExplanationCheck = { failures: Failure[]; level: Level; headwords: string[]; meaning: string; references: string[] };

export const checkExplanation = async (a: Authoring, draft: ExplanationDraft): Promise<ExplanationCheck> => {
  const target = await explanationTarget(a, draft);
  const failures = checkJapaneseExplanation(draft.explanation.text, target.headwords, await kanjiFacts(a, draft.explanation.text));
  return { failures, level: await levelOf(a, target.itemId), headwords: target.headwords, meaning: target.meaning, references: await wiktionaryReferences(a, draft) };
};
