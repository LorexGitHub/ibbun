import * as a from "./authoring/schema.ts";
import * as l from "./levels/schema.ts";
import * as t from "./schema.ts";

/** Every table, in an order that inserts satisfy foreign keys in. */
export const tables = {
  importRun: t.importRun,
  provenance: t.provenance,
  studyItem: t.studyItem,
  kanji: t.kanji,
  word: t.word,
  grammarPoint: t.grammarPoint,
  listeningClip: t.listeningClip,
  wordForm: t.wordForm,
  wordReading: t.wordReading,
  wordSense: t.wordSense,
  japaneseExplanation: t.japaneseExplanation,
  sentence: t.sentence,
  readingPassage: t.readingPassage,
  example: t.example,
  exampleAnswer: t.exampleAnswer,
  wordContainsKanji: t.wordContainsKanji,
  sentenceUsesWord: t.sentenceUsesWord,
  sentenceDemonstratesGrammar: t.sentenceDemonstratesGrammar,
  clipVoicesSentence: t.clipVoicesSentence,
  passageContainsSentence: t.passageContainsSentence,
  grammarRelatesTo: t.grammarRelatesTo,
  wordSupersededBy: t.wordSupersededBy,
  sourceKey: t.sourceKey,
  override: t.override,
  levelCandidate: t.levelCandidate,
  approvalDecision: a.approvalDecision,
  generationRequest: a.generationRequest,
  generationRun: a.generationRun,
  queueEntry: a.queueEntry,
  levelProcess: l.levelProcess,
  computedLevel: l.computedLevel,
};

/** Content Graph rows, table by table: what the fake holds and what Postgres reads load. */
export type Graph = { [K in keyof typeof tables]: (typeof tables)[K]["$inferSelect"][] };

export const emptyGraph = (): Graph =>
  Object.fromEntries(Object.keys(tables).map((name) => [name, []])) as unknown as Graph;
