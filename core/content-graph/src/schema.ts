import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { JlptLevel } from "@ibbun/shared";

export const contentGraph = pgSchema("content_graph");

export const APPROVALS = ["draft", "approved", "rejected"] as const;
export type Approval = (typeof APPROVALS)[number];

export const STUDY_ITEM_TYPES = ["kanji", "word", "grammar_point", "listening_clip"] as const;
export type StudyItemType = (typeof STUDY_ITEM_TYPES)[number];

/** The closed list from docs/licensing.md#approved-licences. */
export const LICENCES = [
  "edrdg",
  "cc-by-sa-4.0",
  "cc-by-sa-3.0",
  "cc-by-2.0-fr",
  "cc-by-4.0",
  "cc-by",
  "bsd-3-clause",
  "voicevox",
  "cc0",
  "ibbun",
] as const;
export type Licence = (typeof LICENCES)[number];

export type Source =
  | { kind: "import"; importRunId: string }
  | { kind: "derived"; process: string; version: string }
  | { kind: "generated"; model: string; promptTemplateVersion: string; generationRunId: string }
  | { kind: "authored"; by: string }
  | { kind: "fixture" };

/** One Sudachi morpheme, stored on its Sentence so reads and grading never call NLP. */
export type Token = {
  surface: string;
  reading: string;
  lemma: string;
  partOfSpeech: string[];
  conjugationForm: string | null;
  start: number;
  end: number;
};

export type ComprehensionQuestion = { question: string; choices: string[]; answer: number };

/** Every Content Graph record: approval state, retired flag and Provenance (docs/content-graph.md#principles). */
const lifecycle = () => ({
  approval: text("approval").$type<Approval>().notNull(),
  retired: boolean("retired").notNull(),
  provenanceId: uuid("provenance_id").notNull(),
});

export const importRun = contentGraph.table("import_run", {
  id: uuid("id").primaryKey(),
  dataset: text("dataset").notNull(),
  upstreamVersion: text("upstream_version").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").notNull(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
  /** When the run went live; null until it applies. The newest per dataset is the live version Credits shows. */
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const provenance = contentGraph.table("provenance", {
  id: uuid("id").primaryKey(),
  source: jsonb("source").$type<Source>().notNull(),
  licence: text("licence").$type<Licence>().notNull(),
  author: text("author"),
  sourceUrl: text("source_url"),
  inputs: uuid("inputs").array().notNull(),
});

export const studyItem = contentGraph.table("study_item", {
  id: uuid("id").primaryKey(),
  type: text("type").$type<StudyItemType>().notNull(),
  ...lifecycle(),
});

export const kanji = contentGraph.table("kanji", {
  studyItemId: uuid("study_item_id").primaryKey(),
  literal: text("literal").notNull(),
  meanings: text("meanings").array().notNull(),
  onReadings: text("on_readings").array().notNull(),
  kunReadings: text("kun_readings").array().notNull(),
  grade: integer("grade"),
  frequency: integer("frequency"),
  strokeCount: integer("stroke_count").notNull(),
  components: text("components").array().notNull(),
  strokes: text("strokes").array().notNull(),
  knownWrongMeanings: jsonb("known_wrong_meanings").$type<{ answer: string; explanation: string }[]>().notNull(),
});

export const word = contentGraph.table("word", {
  studyItemId: uuid("study_item_id").primaryKey(),
  priorityTags: text("priority_tags").array().notNull(),
});

export const wordForm = contentGraph.table("word_form", {
  id: uuid("id").primaryKey(),
  wordId: uuid("word_id").notNull(),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  ...lifecycle(),
});

export const wordReading = contentGraph.table("word_reading", {
  id: uuid("id").primaryKey(),
  wordId: uuid("word_id").notNull(),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  pitchAccent: integer("pitch_accent").array(),
  ...lifecycle(),
});

export const wordSense = contentGraph.table("word_sense", {
  id: uuid("id").primaryKey(),
  wordId: uuid("word_id").notNull(),
  position: integer("position").notNull(),
  partsOfSpeech: text("parts_of_speech").array().notNull(),
  glosses: text("glosses").array().notNull(),
  ...lifecycle(),
});

export type GrammarForm = { text: string; register: "casual" | "polite" };

export const grammarPoint = contentGraph.table("grammar_point", {
  studyItemId: uuid("study_item_id").primaryKey(),
  title: text("title").notNull(),
  forms: jsonb("forms").$type<GrammarForm[]>().notNull(),
  formation: jsonb("formation").$type<string[]>().notNull(),
  register: text("register").$type<"casual" | "neutral" | "polite" | "formal">().notNull(),
  meaning: text("meaning").notNull(),
  notes: text("notes"),
  matcherRule: jsonb("matcher_rule").$type<unknown>(),
});

export const listeningClip = contentGraph.table("listening_clip", {
  studyItemId: uuid("study_item_id").primaryKey(),
  kind: text("kind").$type<"sentence" | "dialogue">().notNull(),
});

/** A Japanese Explanation of one Word sense or one Grammar Point. */
export const japaneseExplanation = contentGraph.table("japanese_explanation", {
  id: uuid("id").primaryKey(),
  wordSenseId: uuid("word_sense_id"),
  grammarPointId: uuid("grammar_point_id"),
  text: text("text").notNull(),
  ...lifecycle(),
});

export const sentence = contentGraph.table("sentence", {
  id: uuid("id").primaryKey(),
  text: text("text").notNull(),
  translationEn: text("translation_en"),
  tokens: jsonb("tokens").$type<Token[]>().notNull(),
  audioKey: text("audio_key"),
  audioVoice: text("audio_voice"),
  unlevelledWordCount: integer("unlevelled_word_count").notNull().default(0),
  ...lifecycle(),
});

export const readingPassage = contentGraph.table("reading_passage", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  form: text("form").$type<"prose" | "dialogue">().notNull(),
  comprehensionQuestions: jsonb("comprehension_questions").$type<ComprehensionQuestion[]>().notNull(),
  ...lifecycle(),
});

export const example = contentGraph.table("example", {
  id: uuid("id").primaryKey(),
  sentenceId: uuid("sentence_id").notNull(),
  studyItemId: uuid("study_item_id").notNull(),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  targetSenseId: uuid("target_sense_id"),
  hint: text("hint"),
  comprehensionQuestion: jsonb("comprehension_question").$type<ComprehensionQuestion>(),
  ...lifecycle(),
});

export const ANSWER_KINDS = ["accepted", "alternate", "known_wrong"] as const;

export const exampleAnswer = contentGraph.table("example_answer", {
  id: uuid("id").primaryKey(),
  exampleId: uuid("example_id").notNull(),
  kind: text("kind").$type<(typeof ANSWER_KINDS)[number]>().notNull(),
  written: text("written").notNull(),
  reading: text("reading"),
  message: text("message"),
  ...lifecycle(),
});

export const wordContainsKanji = contentGraph.table("word_contains_kanji", {
  id: uuid("id").primaryKey(),
  wordId: uuid("word_id").notNull(),
  kanjiId: uuid("kanji_id").notNull(),
  position: integer("position").notNull(),
  ...lifecycle(),
});

export const sentenceUsesWord = contentGraph.table("sentence_uses_word", {
  id: uuid("id").primaryKey(),
  sentenceId: uuid("sentence_id").notNull(),
  wordId: uuid("word_id").notNull(),
  formId: uuid("form_id"),
  readingId: uuid("reading_id"),
  senseId: uuid("sense_id"),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  ...lifecycle(),
});

export const sentenceDemonstratesGrammar = contentGraph.table("sentence_demonstrates_grammar", {
  id: uuid("id").primaryKey(),
  sentenceId: uuid("sentence_id").notNull(),
  grammarPointId: uuid("grammar_point_id").notNull(),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  ...lifecycle(),
});

export const clipVoicesSentence = contentGraph.table("clip_voices_sentence", {
  id: uuid("id").primaryKey(),
  clipId: uuid("clip_id").notNull(),
  sentenceId: uuid("sentence_id").notNull(),
  position: integer("position").notNull(),
  speaker: text("speaker").$type<"男" | "女">().notNull(),
  voice: text("voice").notNull(),
  audioKey: text("audio_key"),
  ...lifecycle(),
});

export const passageContainsSentence = contentGraph.table("passage_contains_sentence", {
  id: uuid("id").primaryKey(),
  passageId: uuid("passage_id").notNull(),
  sentenceId: uuid("sentence_id").notNull(),
  position: integer("position").notNull(),
  /** Who says the line in a `dialogue` passage; null in `prose`. */
  speaker: text("speaker").$type<"男" | "女">(),
  ...lifecycle(),
});

export const grammarRelatesTo = contentGraph.table("grammar_relates_to", {
  id: uuid("id").primaryKey(),
  fromId: uuid("from_id").notNull(),
  toId: uuid("to_id").notNull(),
  kind: text("kind").$type<"see_also" | "contrast">().notNull(),
  comparison: text("comparison"),
  ...lifecycle(),
});

export const wordSupersededBy = contentGraph.table("word_superseded_by", {
  id: uuid("id").primaryKey(),
  retiredWordId: uuid("retired_word_id").notNull(),
  wordId: uuid("word_id").notNull(),
  ...lifecycle(),
});

export const sourceKey = contentGraph.table("source_key", {
  dataset: text("dataset").notNull(),
  upstreamKey: text("upstream_key").notNull(),
  recordId: uuid("record_id").notNull(),
});

export const override = contentGraph.table("override", {
  id: uuid("id").primaryKey(),
  recordId: uuid("record_id").notNull(),
  field: text("field").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  basedOn: jsonb("based_on").$type<unknown>(),
  state: text("state").$type<"active" | "stale" | "orphaned">().notNull(),
  ...lifecycle(),
});

export const LEVEL_CANDIDATE_KINDS = ["editorial", "list", "derived"] as const;

export const levelCandidate = contentGraph.table("level_candidate", {
  id: uuid("id").primaryKey(),
  studyItemId: uuid("study_item_id").notNull(),
  level: text("level").$type<JlptLevel>().notNull(),
  kind: text("kind").$type<(typeof LEVEL_CANDIDATE_KINDS)[number]>().notNull(),
  ...lifecycle(),
});
