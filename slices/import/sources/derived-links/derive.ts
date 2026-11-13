import type { Row } from "@ibbun/content-graph/authoring";

/** A link as a derivation produces it: everything but the lifecycle fields the rebuild adds. */
export type Desired<T extends { id: string; approval: unknown; retired: unknown; provenanceId: unknown }> = Omit<T, "id" | "approval" | "retired" | "provenanceId">;

/** The live rows a derivation reads. Retired and unapproved rows are already filtered out by the caller. */
export type Inputs = {
  words: Set<string>;
  retiredWords: Set<string>;
  kanji: Row<"kanji">[];
  forms: Row<"wordForm">[];
  readings: Row<"wordReading">[];
  sentences: Row<"sentence">[];
  /** Sentence IDs a process other than a rebuild already linked, like `jpn_indices`. */
  coveredSentences: Set<string>;
  clips: Set<string>;
  examples: Row<"example">[];
};

const group = <T, K>(rows: T[], key: (row: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const same = groups.get(key(row));
    if (same) same.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
};

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

/** Hiragana for a katakana string, so a Sudachi reading or lemma meets a JMdict reading. */
export const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Each kanji of the Word's first written form that has any, in order. */
export const wordContainsKanji = ({ words, kanji, forms }: Inputs): Desired<Row<"wordContainsKanji">>[] => {
  const kanjiByLiteral = new Map(kanji.map((k) => [k.literal, k.studyItemId]));
  const formsOf = group(forms, (f) => f.wordId);
  return [...formsOf].filter(([wordId]) => words.has(wordId)).flatMap(([wordId, rows]) => {
    const texts = byPosition(rows).map((f) => [...f.text]);
    const [chars = []] = texts.filter((t) => t.some((c) => kanjiByLiteral.has(c)));
    return chars.flatMap((c, position) => (kanjiByLiteral.has(c) ? [{ wordId, kanjiId: kanjiByLiteral.get(c)!, position }] : []));
  });
};

/** Words by what a token can be called: a written form, or a reading when the Word has no kanji form to match. */
const wordIndex = ({ words, forms, readings }: Inputs) => {
  const names = [
    ...forms.map((f) => ({ text: f.text, wordId: f.wordId, formId: f.id, readingId: null })),
    ...readings.map((r) => ({ text: r.text, wordId: r.wordId, formId: null, readingId: r.id })),
  ];
  return group(names.filter((n) => words.has(n.wordId)), (n) => n.text);
};

/** Sudachi-derived: each token of a Sentence no other process covers, linked to every Word it can name. */
export const sentenceUsesWord = (inputs: Inputs): Desired<Row<"sentenceUsesWord">>[] => {
  const index = wordIndex(inputs);
  return inputs.sentences
    .filter((s) => !inputs.coveredSentences.has(s.id))
    .flatMap((s) =>
      s.tokens.flatMap((t) =>
        [t.lemma, toHiragana(t.lemma)].flatMap((name) => { const named = index.get(name); return named ? [named] : []; }).slice(0, 1).flat().map(({ wordId, formId, readingId }) => ({
          sentenceId: s.id,
          wordId,
          formId,
          readingId,
          senseId: null,
          spanStart: t.start,
          spanEnd: t.end,
        })),
      ),
    );
};

/** A single-Sentence clip is voiced by the Sentence its Example uses, in that Sentence's Audio voice. */
export const clipVoicesSentence = ({ clips, examples, sentences }: Inputs): Desired<Row<"clipVoicesSentence">>[] => {
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));
  return examples.flatMap(({ studyItemId, sentenceId }) => {
    const sentence = sentenceById.get(sentenceId);
    if (!clips.has(studyItemId) || !sentence?.audioVoice) return [];
    return [{ clipId: studyItemId, sentenceId, position: 0, speaker: "女" as const, voice: sentence.audioVoice, audioKey: sentence.audioKey }];
  });
};

/** Every (written form, reading) pair of each Word. */
const pairsByWord = ({ forms, readings }: Inputs) => {
  const formsOf = group(forms, (f) => f.wordId);
  const readingsOf = group(readings, (r) => r.wordId);
  return new Map([...formsOf].filter(([id]) => readingsOf.has(id)).map(([id, fs]) => [id, fs.flatMap((f) => readingsOf.get(id)!.map((r) => `${f.text}\0${r.text}`))]));
};

/** A retired Word whose every (written form, reading) pair lives on in exactly one surviving Word. */
export const supersededBy = (inputs: Inputs): Desired<Row<"wordSupersededBy">>[] => {
  const pairs = [...pairsByWord(inputs)];
  const holders = new Map<string, Set<string>>();
  for (const [wordId, own] of pairs) if (inputs.words.has(wordId)) for (const pair of own) holders.set(pair, new Set(holders.get(pair)).add(wordId));
  return pairs.filter(([wordId]) => inputs.retiredWords.has(wordId)).flatMap(([retiredWordId, own]) => {
    const successors = new Set(own.map((p) => (holders.get(p)?.size === 1 ? [...holders.get(p)!][0]! : null)));
    const [only] = successors;
    return successors.size === 1 && only ? [{ retiredWordId, wordId: only }] : [];
  });
};
