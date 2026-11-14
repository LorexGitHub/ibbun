import { describe, expect, it } from "vitest";
import { createFakeContentGraph, n5Fixture } from "@ibbun/content-graph/testing";
import { grade } from "@ibbun/content-graph/grade";
import { questionFor } from "./question.ts";

const { graph, ids } = n5Fixture();
const content = createFakeContentGraph(graph);
const page = async (id: string) => (await content.studyItem(id as never))!;

describe("questionFor", () => {
  it("blanks a Word's target in its Example and asks for the missing Japanese", async () => {
    const q = questionFor(await page(ids.words["山"]!));
    expect(q).toMatchObject({
      itemType: "word",
      sentence: { before: "", target: "山", after: "に登りました。", mode: "blank" },
      translationEn: "I climbed a mountain.",
      hint: "mountain",
    });
    expect(q!.facets.map((f) => f.facet)).toEqual(["japanese"]);
  });

  it("asks for a Kanji's reading and its meaning, and highlights rather than blanks the target", async () => {
    const q = questionFor(await page(ids.kanji["山"]!))!;
    expect(q.itemType).toBe("kanji");
    expect(q.sentence.mode).toBe("highlight");
    expect(q.facets.map((f) => f.facet)).toEqual(["japanese", "meaning"]);
    const [reading, meaning] = q.facets.map((f) => f.answerData);
    expect(grade(reading!, "やま")).toMatchObject({ outcome: "pass" });
    expect(grade(meaning!, "Mountain")).toMatchObject({ outcome: "pass" });
    expect(grade(meaning!, "river")).toMatchObject({ outcome: "fail" });
  });

  it("builds a Grammar Point question from its first Example", async () => {
    const q = questionFor(await page(ids.grammar[Object.keys(ids.grammar)[0]!]!))!;
    expect(q.itemType).toBe("grammar_point");
    expect(q.sentence.target).not.toBe("");
  });

  it("rotates to the Example after the one given, wrapping round", async () => {
    const p = await page(ids.words["山"]!);
    const first = questionFor(p)!;
    const second = questionFor(p, first.exampleId)!;
    expect(second.exampleId).not.toBe(first.exampleId);
    expect(questionFor(p, second.exampleId)!.exampleId).toBe(first.exampleId);
  });

  it("starts from the first Example when the one given is not on the page", async () => {
    const p = await page(ids.words["山"]!);
    expect(questionFor(p, "nope")!.exampleId).toBe(questionFor(p)!.exampleId);
  });

  it("answers null for a Study Item with no approved Example", async () => {
    const p = await page(ids.words["山"]!);
    expect(questionFor({ ...p, examples: [] })).toBeNull();
  });

  it("answers null for a Listening Clip, which the listening slice practises", async () => {
    const p = await page(ids.words["山"]!);
    expect(questionFor({ ...p, item: { type: "listening_clip", id: p.item.id, level: "N5", kind: "sentence" } })).toBeNull();
  });
});
