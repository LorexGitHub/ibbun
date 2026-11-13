import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import type { ItemPage, Summary } from "../contract.ts";
import { ItemView, cramHref, learnNowHref } from "../web/ItemView.tsx";

const id = (n: number) => StudyItemId.parse(`00000058-0000-7000-8000-${n.toString().padStart(12, "0")}`);

const summary = (over: Partial<Summary> = {}): Summary => ({ id: id(1), type: "kanji", level: "N5", label: "日", reading: "ニチ", meaning: "day", ...over });

const inRouter = (node: React.ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>);

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

describe("ItemView as a page or a sheet", () => {
  it("links back to the Library from its own page, and not from the sheet", () => {
    expect(item()).toContain('<a href="/browse" data-discover="true">Library</a>');
    expect(inRouter(<ItemView page={wordPage()} sheet />)).not.toContain('href="/browse"');
  });

  it("offers Cram this for any Study Item, introduced or not", () => {
    expect(cramHref(id(2))).toBe(`/cram?items=${id(2)}`);
    for (const introduced of [true, false]) {
      const html = item({ introduced });
      expect(html).toContain(`href="${cramHref(id(2))}"`);
      expect(html).toContain(">Cram this</a>");
    }
  });
});

describe("the sheet's place on the screen", () => {
  it("lies above the dock, so the dock never covers what the sheet says", () => {
    const layer = (file: string, rule: RegExp) => Number(readFileSync(new URL(file, import.meta.url), "utf8").match(rule)?.[1]);
    const sheet = layer("../web/browse.css", /\.wall-sheet-back \{[^}]*z-index: (\d+)/);
    const dock = layer("../../../platform/ui/src/kit.css", /\.app-dock \{[^}]*z-index: (\d+)/);
    expect(dock).toBeGreaterThan(0);
    expect(sheet).toBeGreaterThan(dock);
  });
});

describe("ItemView in parts", () => {
  it("sets the details, each group of related items and the Examples apart as parts under the headword", () => {
    const html = item();
    expect(html.match(/<section class="item-part">/g)).toHaveLength(3);
    expect(html).toContain('<article aria-labelledby="item-title" class="item">');
    expect(html).not.toContain('class="card"');
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

  it("shows Components for a single component", () => {
    expect(item({ detail: kanji({ components: ["一"] }) })).toContain("Components");
  });

  it("heads a Word with nothing when it has neither a written form nor a reading", () => {
    expect(item({ detail: { type: "word", forms: [], readings: [], senses: [] } })).toContain('<h1 id="item-title" lang="ja"></h1>');
  });

  it("marks the level and type as plain pills and Locked as the ink one", () => {
    const html = item({ locked: true });
    expect(html).toContain('<span class="pill">N5</span>');
    expect(html).toContain('<span class="pill">word</span>');
    expect(html).toContain('<span class="pill pill--ink">Locked</span>');
  });

  const bare = (over: Partial<ItemPage> = {}) => item({ detail: { type: "word", forms: ["日本"], readings: [], senses: [] }, examples: [], related: [], ...over });
  const sense = (partsOfSpeech: string[], japaneseExplanation: string | null) => bare({ detail: { type: "word", forms: ["日本"], readings: [], senses: [{ partsOfSpeech, glosses: ["Japan"], japaneseExplanation }] } });

  it("sets a single part of speech in small print and the Japanese Explanation in its own paragraph", () => {
    const html = sense(["n"], "アジアの国。");
    expect(html).toMatch(/<small>n(<!-- -->)? <\/small>/);
    expect(html).toContain('<p lang="ja">アジアの国。</p>');
  });

  it("leaves no empty small print or paragraph for a sense without parts of speech or explanation", () => {
    const html = sense([], null);
    expect(html).not.toContain("<small");
    expect(html).not.toContain("<p lang");
  });

  it("sets a Grammar Point's Japanese Explanation and notes in paragraphs, and leaves none when it has neither", () => {
    const grammar = (japaneseExplanation: string | null, notes: string | null) =>
      bare({ detail: { type: "grammar_point", title: "〜ます", forms: [], formation: [], register: "polite", meaning: "polite ending", japaneseExplanation, notes } });
    const full = grammar("ていねいな言い方。", "Use with strangers.");
    expect(full).toContain('<p lang="ja">ていねいな言い方。</p>');
    expect(full).toContain("<p>Use with strangers.</p>");
    const none = grammar(null, null);
    expect(none).not.toContain('<p lang="ja">');
    expect(none).not.toContain("<p></p>");
  });

  it("sets a link's note and an Example's translation in small print, and nothing when they are missing", () => {
    const related = (note: string | null) => [{ heading: "Related grammar", items: [{ summary: summary(), note }] }];
    const examples = (translation: string | null) => [{ id: "e1", text: "日本に行きたい。", translation, credits: [] }];
    expect(bare({ related: related("casual form") })).toMatch(/<small> (<!-- -->)?casual form<\/small>/);
    expect(bare({ related: related(null) })).not.toContain("<small");
    expect(bare({ examples: examples("I want to go.") })).toMatch(/<small> (<!-- -->)?I want to go\.<\/small>/);
    expect(bare({ examples: examples(null) })).not.toContain("<small");
  });

  it("shows a link's note, a page's own credit, and no Examples card when there are none", () => {
    const html = item({ examples: [], credits: [{ text: "Wiktionary", href: "https://ja.wiktionary.org" }], related: [{ heading: "Related grammar", items: [{ summary: summary({ type: "grammar_point" }), note: "casual form" }] }] });
    expect(html).toContain("casual form");
    expect(html).toContain('href="https://ja.wiktionary.org"');
    expect(html).not.toContain("Examples");
  });
});
