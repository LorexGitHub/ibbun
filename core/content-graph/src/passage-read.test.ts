import { describe, expect, it } from "vitest";
import { createFakeContentGraph, emptyGraph } from "./testing.ts";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const life = { approval: "approved" as const, retired: false, provenanceId: ID(1) };

describe("readingPassage", () => {
  it("gives a dialogue's lines in order with their speakers, and its comprehension questions", async () => {
    const graph = emptyGraph();
    const questions = [{ question: "女の人は何をしますか。", choices: ["a", "b", "c", "d"], answer: 2 }];
    graph.readingPassage.push({ id: ID(2), title: "会話", form: "dialogue", comprehensionQuestions: questions, ...life });
    for (const [n, text, speaker, position] of [[3, "こんにちは。", "男", 0], [4, "どうも。", "女", 1]] as const) {
      graph.sentence.push({ id: ID(n), text, translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
      graph.passageContainsSentence.push({ id: ID(n + 10), passageId: ID(2), sentenceId: ID(n), position, speaker, ...life });
    }
    const passage = await createFakeContentGraph(graph).readingPassage(ID(2));
    expect(passage?.questions).toEqual(questions);
    expect(passage?.sentences.map((s) => [s.text, s.speaker])).toEqual([["こんにちは。", "男"], ["どうも。", "女"]]);
  });

  it("finds the asked-for passage among other visible ones", async () => {
    const graph = emptyGraph();
    for (const [n, title] of [[2, "前の話"], [3, "この話"]] as const)
      graph.readingPassage.push({ id: ID(n), title, form: "prose", comprehensionQuestions: [], ...life });
    expect((await createFakeContentGraph(graph).readingPassage(ID(3)))?.title).toBe("この話");
  });

  it("holds only its own visible Sentences, each with only its own visible links to visible Words, in the order they appear", async () => {
    const graph = emptyGraph();
    graph.readingPassage.push({ id: ID(2), title: "話", form: "prose", comprehensionQuestions: [], ...life });
    for (const [n, position, passage, extra] of [[3, 0, 2, {}], [4, 1, 2, {}], [5, 2, 9, {}], [6, 3, 2, { approval: "draft" }]] as const) {
      graph.sentence.push({ id: ID(n), text: `文${n}`, translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
      graph.passageContainsSentence.push({ id: ID(n + 10), passageId: ID(passage), sentenceId: ID(n), position, speaker: null, ...life, ...extra });
    }
    graph.studyItem.push({ id: ID(20), type: "word", ...life }, { id: ID(21), type: "word", ...life }, { id: ID(22), type: "word", ...life, approval: "draft" });
    const uses = (n: number, sentence: number, word: number, start: number, extra: object = {}) =>
      graph.sentenceUsesWord.push({ id: ID(n), sentenceId: ID(sentence), wordId: ID(word), formId: null, readingId: null, senseId: null, spanStart: start, spanEnd: start + 1, ...life, ...extra });
    uses(30, 3, 21, 4);
    uses(31, 3, 20, 1);
    uses(32, 3, 20, 6, { approval: "draft" });
    uses(33, 3, 22, 8);
    uses(34, 4, 20, 0);
    const passage = await createFakeContentGraph(graph).readingPassage(ID(2));
    expect(passage?.sentences.map((s) => s.text)).toEqual(["文3", "文4"]);
    expect(passage?.sentences.map((s) => s.words.map((w) => [w.wordId, w.start]))).toEqual([
      [[ID(20), 1], [ID(21), 4]],
      [[ID(20), 0]],
    ]);
  });
});
