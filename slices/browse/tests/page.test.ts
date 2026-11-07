import { describe, expect, it } from "vitest";
import type { Attribution, StudyItemPage } from "@mojibun/content-graph";
import { StudyItemId } from "@mojibun/shared";
import { creditsOf, itemPageOf } from "../server/page.ts";

const id = StudyItemId.parse("00000058-0000-7000-8000-000000000001");
const learner = { locked: false, introduced: false };

const credit = (over: Partial<Attribution[number]>): Attribution[number] => ({
  licence: "cc-by-2.0-fr", licenceName: "CC BY 2.0 FR", dataset: "Tatoeba", author: "CK", url: "https://tatoeba.org/sentences/show/1", inline: true, ...over,
});

describe("creditsOf", () => {
  it("keeps only credits shown beside the content, as author and dataset with a link", () => {
    expect(creditsOf([credit({}), credit({ inline: false, author: "someone else" })])).toEqual([{ text: "CK · Tatoeba", href: "https://tatoeba.org/sentences/show/1" }]);
  });

  it("falls back to the licence name, and leaves out the link when there is none", () => {
    expect(creditsOf([credit({ dataset: null, author: null, url: null })])).toEqual([{ text: "CC BY 2.0 FR" }]);
  });
});

describe("itemPageOf", () => {
  const clip: StudyItemPage = { item: { type: "listening_clip", id, level: "N5", kind: "sentence" }, examples: [], links: [], attribution: [] };

  it("shows nothing for a Listening Clip: it is practised, not browsed", () => {
    expect(itemPageOf(clip, learner)).toBeNull();
  });

  it("drops the Sentence links of a clip-shaped page and keeps the Learner's flags", () => {
    const grammar: StudyItemPage = {
      item: { type: "grammar_point", id, level: null, title: "〜ます", forms: [], formation: [], register: "polite", meaning: "polite", japaneseExplanation: null, notes: null },
      examples: [],
      links: [{ kind: "voices", position: 0, speaker: "女", voice: "v", audioKey: null, sentence: { id: "s", text: "t", translationEn: null, tokens: [], audio: null, attribution: [] } }],
      attribution: [],
    };
    expect(itemPageOf(grammar, { locked: true, introduced: true })).toMatchObject({ level: null, locked: true, introduced: true, related: [] });
  });
});
