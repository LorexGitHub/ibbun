import { randomUUID } from "node:crypto";
import { emptyGraph, type Graph } from "@ibbun/content-graph/testing";

/** A graph with an approved Word (食べる, N5), Kanji (食, N4) and Grammar Point (〜ます, N5), for the slice's tests. */
export const world = () => {
  const graph: Graph = emptyGraph();
  const provenanceId = randomUUID();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life = { approval: "approved" as const, retired: false, provenanceId };

  const wordId = randomUUID();
  const senseId = randomUUID();
  graph.studyItem.push({ id: wordId, type: "word", ...life });
  graph.word.push({ studyItemId: wordId, priorityTags: [], usuallyKana: false });
  graph.wordForm.push({ id: randomUUID(), wordId, position: 0, text: "食べる", ...life });
  graph.wordReading.push({ id: randomUUID(), wordId, position: 0, text: "たべる", pitchAccent: null, ...life });
  graph.wordSense.push({ id: senseId, wordId, position: 0, partsOfSpeech: ["v1"], glosses: ["to eat"], ...life });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: wordId, level: "N5", kind: "list", ...life });

  const kanjiId = randomUUID();
  graph.studyItem.push({ id: kanjiId, type: "kanji", ...life });
  graph.kanji.push({
    studyItemId: kanjiId, literal: "食", meanings: ["eat"], onReadings: ["ショク"], kunReadings: ["た.べる"], grade: 2, frequency: null,
    strokeCount: 9, components: [], strokes: [], knownWrongMeanings: [],
  });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: kanjiId, level: "N4", kind: "list", ...life });

  const grammarId = randomUUID();
  graph.studyItem.push({ id: grammarId, type: "grammar_point", ...life });
  graph.grammarPoint.push({
    studyItemId: grammarId, title: "〜ます", forms: [{ text: "ます", register: "polite" }], formation: ["verb stem + ます"],
    register: "polite", meaning: "polite verb ending", notes: null, matcherRule: null,
  });
  graph.levelCandidate.push({ id: randomUUID(), studyItemId: grammarId, level: "N5", kind: "list", ...life });

  return { graph, wordId, senseId, kanjiId, grammarId, life };
};
