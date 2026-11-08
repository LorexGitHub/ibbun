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
});
