import { describe, expect, it } from "vitest";
import { createFakeContentGraph, n5Fixture, type Graph } from "@ibbun/content-graph/testing";
import type { ContentGraph } from "@ibbun/content-graph";
import type { StudyItemId } from "@ibbun/shared";
import { createTeacher } from "./teach.ts";

/** The fake graph, recording every page asked for. */
const counted = (graph: Graph) => {
  const inner = createFakeContentGraph(graph);
  const asked: string[] = [];
  const counting: ContentGraph = { ...inner, studyItem: (id) => (asked.push(id), inner.studyItem(id)) };
  return { graph: counting, asked };
};

describe("teaching a Kanji", () => {
  const { graph: fixture, ids } = n5Fixture();
  const kanjiWithSense = Object.values(ids.kanji).find((id) => fixture.example.some((e) => e.studyItemId === id && e.targetSenseId))!;
  // A second Word that holds the Kanji but is not in the Example's Sentence
  const link = fixture.wordContainsKanji.find((l) => l.kanjiId === kanjiWithSense)!;
  const elsewhere = Object.values(ids.words).find((id) => id !== link.wordId)!;
  const graph: Graph = { ...fixture, wordContainsKanji: [...fixture.wordContainsKanji, { ...link, id: "00000000-0000-7000-8000-00000000e1e1", wordId: elsewhere }] };

  it("reads only the Words written in the Example's Sentence to find the target sense's explanation", async () => {
    const { graph: g, asked } = counted(graph);
    const taught = await createTeacher(g).teach(kanjiWithSense as StudyItemId);
    const page = (await createFakeContentGraph(graph).studyItem(kanjiWithSense as StudyItemId))!;
    const text = page.examples[0]!.sentence.text;
    const inSentence = page.links.flatMap((l) => (l.kind === "contained_in_word" && text.includes(l.word.label) ? [l.word.id] : []));
    expect(taught?.prompt.japaneseExplanation).not.toBeNull();
    expect(asked.filter((id) => id !== kanjiWithSense).sort()).toEqual(inSentence.sort());
    expect(page.links.filter((l) => l.kind === "contained_in_word").length).toBeGreaterThan(inSentence.length);
  });

  it("reads no Word when the Example names no sense", async () => {
    const noSense: Graph = { ...graph, example: graph.example.map((e) => ({ ...e, targetSenseId: null })) };
    const { graph: g, asked } = counted(noSense);
    await createTeacher(g).teach(kanjiWithSense as StudyItemId);
    expect(asked).toEqual([kanjiWithSense]);
  });
});
