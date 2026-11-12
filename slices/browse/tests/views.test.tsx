import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { ItemPage, Summary } from "../contract.ts";
import { BrowseView, type BrowseViewProps } from "../web/BrowseView.tsx";
import { ItemView, learnNowHref } from "../web/ItemView.tsx";

const id = (n: number) => StudyItemId.parse(`00000058-0000-7000-8000-${n.toString().padStart(12, "0")}`);

const summary = (over: Partial<Summary> = {}): Summary => ({ id: id(1), type: "kanji", level: "N5", label: "日", reading: "ニチ", meaning: "day", ...over });

const inRouter = (node: React.ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>);

const browse = (over: Partial<BrowseViewProps> = {}) =>
  inRouter(<BrowseView query="" level="N5" items={[summary()]} message={null} onQuery={() => {}} onLevel={() => {}} {...over} />);

const wordPage = (over: Partial<ItemPage> = {}): ItemPage => ({
  id: id(2),
  level: "N5",
  locked: false,
  introduced: false,
  detail: { type: "word", forms: ["日本"], readings: [{ text: "にほん", pitchAccent: [2] }], senses: [{ partsOfSpeech: ["n"], glosses: ["Japan"], japaneseExplanation: null }] },
  examples: [{ id: "e1", text: "日本に行きたいです。", translation: "I want to go to Japan.", credits: [{ text: "CK", href: "https://tatoeba.org/sentences/show/1" }] }],
  related: [{ heading: "Kanji in this word", items: [{ summary: summary(), note: null }] }],
  credits: [],
  ...over,
});

const item = (over: Partial<ItemPage> = {}) => inRouter(<ItemView page={wordPage(over)} />);

describe("BrowseView", () => {
  it("shows the five levels with the current one pressed", () => {
    const html = browse({ level: "N4" });
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) expect(html).toContain(`>${level}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>N4</);
  });

  it("groups items under Kanji, Words and Grammar, skipping empty groups, each linking to its page", () => {
    const html = browse({ items: [summary(), summary({ id: id(3), type: "word", label: "日本" })] });
    expect(html).toContain("<h2>Kanji</h2>");
    expect(html).toContain("<h2>Words</h2>");
    expect(html).not.toContain("<h2>Grammar</h2>");
    expect(html).toContain(`href="/browse/items/${id(1)}"`);
  });

  it("labels a level plainly and an Unlevelled item as Unlevelled, never as an estimate", () => {
    const html = browse({ items: [summary({ level: "N3" }), summary({ id: id(4), level: null })] });
    expect(html).toContain(">N3</span>");
    expect(html).toContain(">Unlevelled</span>");
    expect(html).not.toMatch(/estimate|approx|~|\*/i);
  });

  it("hides the level buttons while searching and says when nothing matches", () => {
    const html = browse({ query: " zzz ", items: [] });
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("Nothing matches &quot;zzz&quot;.");
  });

  it("says when a level is empty, and while loading", () => {
    expect(browse({ items: [] })).toContain("Nothing at N5 yet. Pick another level above.");
    expect(browse({ items: null })).toContain("Loading…");
  });

  it("shows a load message as a status", () => {
    expect(browse({ message: "Log in to browse." })).toContain('<p role="status">Log in to browse.</p>');
  });
});

describe("ItemView", () => {
  it("shows a Locked badge and a Learn now button linking to Learn for a locked item", () => {
    const html = item({ locked: true });
    expect(html).toContain(">Locked</span>");
    expect(html).toContain(`href="${learnNowHref(id(2))}"`);
    expect(html).toContain(">Learn now</a>");
    expect(learnNowHref(id(2))).toBe(`/learn?now=${id(2)}`);
  });

  it("shows no Locked badge for an unlocked item, but still offers Learn now until it is introduced", () => {
    const html = item({ locked: false });
    expect(html).not.toContain("Locked");
    expect(html).toContain("Learn now");
  });

  it("offers no Learn now once the item is introduced", () => {
    expect(item({ introduced: true })).not.toContain("Learn now");
  });

  it("shows no position number", () => {
    expect(item({ locked: true })).not.toMatch(/position|#\d|\bnumber\b|rank/i);
  });

  it("shows the headword, level, readings with pitch accent, senses, Examples and their credit", () => {
    const html = item();
    expect(html).toContain(">日本</h1>");
    expect(html).toContain(">N5</span>");
    expect(html).toContain("にほん [2]");
    expect(html).toContain("Japan");
    expect(html).toContain("日本に行きたいです。");
    expect(html).toContain('href="https://tatoeba.org/sentences/show/1"');
  });

  it("links the related Study Items", () => {
    const html = item();
    expect(html).toContain("<h2>Kanji in this word</h2>");
    expect(html).toContain(`href="/browse/items/${id(1)}"`);
  });

  it("shows a Kanji's readings and a Grammar Point's formation", () => {
    const kanji = item({ detail: { type: "kanji", literal: "日", meanings: ["day"], onReadings: ["ニチ"], kunReadings: [], grade: 1, strokeCount: 4, components: [] } });
    expect(kanji).toContain(">日</h1>");
    expect(kanji).toContain("ニチ");
    expect(kanji).toContain("School grade");

    const grammar = item({
      detail: { type: "grammar_point", title: "〜ます", forms: [{ text: "ます", register: "polite" }], formation: ["verb stem + ます"], register: "polite", meaning: "polite verb ending", japaneseExplanation: null, notes: null },
    });
    expect(grammar).toContain(">〜ます</h1>");
    expect(grammar).toContain("verb stem + ます");
  });
});

describe("ItemView details", () => {
  const kanji = (over: Partial<Extract<ItemPage["detail"], { type: "kanji" }>> = {}): ItemPage["detail"] => ({
    type: "kanji", literal: "日", meanings: ["day", "sun"], onReadings: ["ニチ", "ジツ"], kunReadings: ["ひ"], grade: 1, strokeCount: 4, components: ["一", "口"], ...over,
  });

  it("lists every Kanji field: meanings, both readings, strokes, grade and components", () => {
    const html = item({ detail: kanji() });
    expect(html).toContain("day, sun");
    expect(html).toContain("ニチ、ジツ");
    expect(html).toContain("ひ");
    expect(html).toContain("<dd>4</dd>");
    expect(html).toContain("<dd>1</dd>");
    expect(html).toContain("一 口");
  });

  it("leaves out an unknown grade and empty components, and dashes a missing reading", () => {
    const html = item({ detail: kanji({ grade: null, components: [], kunReadings: [] }) });
    expect(html).not.toContain("School grade");
    expect(html).not.toContain("Components");
    expect(html).toContain('<dd lang="ja">—</dd>');
  });

  it("heads a Word by its first written form, or its reading when it has none", () => {
    const word = (forms: string[]): ItemPage["detail"] => ({ type: "word", forms, readings: [{ text: "ああ", pitchAccent: null }], senses: [] });
    expect(item({ detail: word(["日本", "二本"]) })).toContain(">日本</h1>");
    expect(item({ detail: word([]) })).toContain(">ああ</h1>");
  });

  it("shows a Word's parts of speech, glosses and Japanese Explanation, and every reading", () => {
    const html = item({
      detail: {
        type: "word", forms: ["日本"],
        readings: [{ text: "にほん", pitchAccent: [2, 3] }, { text: "にっぽん", pitchAccent: null }],
        senses: [{ partsOfSpeech: ["n", "adj-no"], glosses: ["Japan", "nippon"], japaneseExplanation: "アジアの国。" }],
      },
    });
    expect(html).toContain("n, adj-no");
    expect(html).toContain("Japan; nippon");
    expect(html).toContain("アジアの国。");
    expect(html).toContain("にほん [2, 3]、にっぽん");
  });

  it("shows a Grammar Point's forms, register, Japanese Explanation and notes", () => {
    const html = item({
      detail: {
        type: "grammar_point", title: "〜ます", forms: [{ text: "ます", register: "polite" }, { text: "る", register: "casual" }],
        formation: ["stem", "ます"], register: "polite", meaning: "polite ending", japaneseExplanation: "ていねいな言い方。", notes: "Use with strangers.",
      },
    });
    expect(html).toContain("ます (polite)、る (casual)");
    expect(html).toContain("stem; ます");
    expect(html).toContain("<dd>polite</dd>");
    expect(html).toContain("ていねいな言い方。");
    expect(html).toContain("Use with strangers.");
  });

  it("shows a link's note, a page's own credit, and no Examples card when there are none", () => {
    const html = item({ examples: [], credits: [{ text: "Wiktionary", href: "https://ja.wiktionary.org" }], related: [{ heading: "Related grammar", items: [{ summary: summary({ type: "grammar_point" }), note: "casual form" }] }] });
    expect(html).toContain("casual form");
    expect(html).toContain('href="https://ja.wiktionary.org"');
    expect(html).not.toContain("Examples");
  });
});
