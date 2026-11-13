import type { Authoring } from "@ibbun/content-graph/authoring";
import { clipVoicesSentence, sentenceUsesWord, supersededBy, wordContainsKanji, type Inputs } from "./derive.ts";
import { replaceDerivedLinks, type Changes } from "./replace.ts";

/** Bump when a derivation's rules change, or SudachiDict is upgraded: the next rebuild replaces every derived link. */
export const DERIVED_PROCESS_VERSION = "1";

/** The Tatoeba import writes its `jpn_indices` links as derived by its refresh. They are upstream's, not a rebuild's. */
const JPN_INDICES_PROCESS = "refresh";

const live = { approval: "approved", retired: false } as const;

const readInputs = async (a: Authoring): Promise<Inputs> => {
  const items = await a.rows("studyItem");
  const idsOf = (type: string, retired: boolean) => new Set(items.filter((i) => i.type === type && i.retired === retired && (retired || i.approval === "approved")).map((i) => i.id));
  const [kanji, forms, readings, sentences, examples, uses, derived] = await Promise.all([
    a.rows("kanji"),
    a.rows("wordForm", { retired: false }),
    a.rows("wordReading", { retired: false }),
    a.rows("sentence", live),
    a.rows("example", live),
    a.rows("sentenceUsesWord"),
    a.rows("provenance"),
  ]);
  const kanjiIds = idsOf("kanji", false);
  const rebuilt = new Set(derived.filter((p) => p.source.kind === "derived" && p.source.process !== JPN_INDICES_PROCESS).map((p) => p.id));
  return {
    words: idsOf("word", false),
    retiredWords: idsOf("word", true),
    kanji: kanji.filter((k) => kanjiIds.has(k.studyItemId)),
    forms,
    readings,
    sentences,
    coveredSentences: new Set(uses.filter((u) => !rebuilt.has(u.provenanceId)).map((u) => u.sentenceId)),
    clips: idsOf("listening_clip", false),
    examples,
  };
};

/**
 * Rebuilds the derived links (import-pipeline.md#derived-links): each process recomputes what its inputs determine and
 * `replaceDerivedLinks` writes only the difference. Nothing is retired. A process version change replaces all of a
 * process's links. Running it twice, or after a crash halfway, ends in the same state.
 */
export const rebuildDerivedLinks = async ({ authoring }: { authoring: Authoring }): Promise<Changes> => {
  const inputs = await readInputs(authoring);
  const version = DERIVED_PROCESS_VERSION;
  const results = [
    await replaceDerivedLinks(authoring, "wordContainsKanji", { name: "word-contains-kanji", version, licence: "edrdg" }, wordContainsKanji(inputs)),
    await replaceDerivedLinks(authoring, "sentenceUsesWord", { name: "sentence-uses-word", version, licence: "ibbun", keeps: [JPN_INDICES_PROCESS] }, sentenceUsesWord(inputs)),
    await replaceDerivedLinks(authoring, "clipVoicesSentence", { name: "clip-voices-sentence", version, licence: "ibbun" }, clipVoicesSentence(inputs)),
    await replaceDerivedLinks(authoring, "wordSupersededBy", { name: "superseded-by", version, licence: "edrdg" }, supersededBy(inputs)),
  ];
  return { added: results.reduce((n, r) => n + r.added, 0), removed: results.reduce((n, r) => n + r.removed, 0) };
};
