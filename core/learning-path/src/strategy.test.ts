import { describe, expect, it } from "vitest";
import type { PathItem } from "@ibbun/content-graph";
import { DEFAULT_BANDS, frequencyV1, tieBreak, type Bands } from "./strategy.ts";
import { pathItem } from "./tests/items.ts";
import type { StudyItemId } from "@ibbun/shared";
import { TRACKS, type Track } from "./track.ts";

const plan = (items: PathItem[], { seed = "seed", introduced = [] as string[], bands = DEFAULT_BANDS as Bands } = {}) =>
  frequencyV1(bands)({ items, seed, introduced: new Set(introduced) });
const ids = (items: PathItem[]) => items.map((i) => i.id);
const all = (items: PathItem[], seed = "seed") => plan(items, { seed }).next(TRACKS, items.length);
const track = (level: Track["level"], type: Track["type"]): Track => ({ level, type });

describe("order within a Track", () => {
  it("orders Words by nf band, then other priority tags, then the rest", () => {
    const words = [
      pathItem("word", "N5"),
      pathItem("word", "N5", { priorityTags: ["spec1"] }),
      pathItem("word", "N5", { priorityTags: ["nf02", "ichi1"] }),
      pathItem("word", "N5", { priorityTags: ["news2", "nf01"] }),
      pathItem("word", "N5", { priorityTags: ["ichi1"] }),
    ];
    const [rest, spec, nf02, nf01] = words;
    const order = all(words);
    expect(order.slice(0, 2)).toEqual([nf01!.id, nf02!.id]);
    expect(order.at(-1)).toBe(rest!.id);
    expect(order).toContain(spec!.id);
  });

  it("merges nf tags into bands of the configured size", () => {
    const [a, b] = [pathItem("word", "N5", { priorityTags: ["nf01"] }), pathItem("word", "N5", { priorityTags: ["nf02"] })];
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const firsts = new Set(seeds.map((seed) => plan([a!, b!], { seed, bands: { ...DEFAULT_BANDS, wordNfTags: 2 } }).next(TRACKS, 1)[0]));
    expect(firsts).toEqual(new Set([a!.id, b!.id]));
  });

  it("orders Kanji by frequency band, then grade, then the rest", () => {
    const kanji = [
      pathItem("kanji", "N5"),
      pathItem("kanji", "N5", { grade: 3 }),
      pathItem("kanji", "N5", { grade: 1 }),
      pathItem("kanji", "N5", { frequency: 251, grade: 1 }),
      pathItem("kanji", "N5", { frequency: 250 }),
    ];
    const [rest, g3, g1, f251, f250] = kanji;
    expect(all(kanji)).toEqual([f250, f251, g1, g3, rest].map((k) => k!.id));
  });

  it("puts Kanji in the same frequency band in the seed's order", () => {
    const [a, b] = [pathItem("kanji", "N5", { frequency: 1 }), pathItem("kanji", "N5", { frequency: 250 })];
    const firsts = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => all([a!, b!], seed)[0]));
    expect(firsts).toEqual(new Set([a!.id, b!.id]));
  });

  it("orders Grammar Points by how many other same-level Grammar Points their Examples demonstrate", () => {
    const n4 = pathItem("grammar_point", "N4");
    const suspended = pathItem("grammar_point", "N5", { suspended: true });
    const plain = pathItem("grammar_point", "N5");
    const one = pathItem("grammar_point", "N5", { demonstrates: [plain.id, n4.id, suspended.id, "missing" as StudyItemId] });
    const two = pathItem("grammar_point", "N5", { demonstrates: [plain.id, one.id] });
    expect(plan([two, one, plain, n4, suspended]).next([track("N5", "grammar_point")], 9)).toEqual(ids([plain, one, two]));
  });

  it("breaks ties with hash(seed, id), so Learners differ and a new item never reshuffles the others", () => {
    const clips = Array.from({ length: 8 }, () => pathItem("listening_clip", "N5"));
    const byHash = (seed: string) => [...clips].sort((a, b) => tieBreak(seed, a.id).localeCompare(tieBreak(seed, b.id))).map((c) => c.id);
    expect(all(clips, "alice")).toEqual(byHash("alice"));
    expect(all(clips, "bob")).not.toEqual(all(clips, "alice"));
    const added = pathItem("listening_clip", "N5");
    expect(all([...clips, added], "alice").filter((id) => id !== added.id)).toEqual(all(clips, "alice"));
  });
});

describe("next", () => {
  it("goes round the active Tracks easiest level first, one item each, and drops empty Tracks", () => {
    const n4k = [pathItem("kanji", "N4", { frequency: 1 }), pathItem("kanji", "N4", { frequency: 300 }), pathItem("kanji", "N4", { frequency: 600 })];
    const n5g = pathItem("grammar_point", "N5");
    const n3w = pathItem("word", "N3");
    const p = plan([...n4k, n5g, n3w]);
    const active = [track("N3", "word"), track("N4", "kanji"), track("N5", "grammar_point")];
    expect(p.next(active, 5)).toEqual([n5g.id, n4k[0]!.id, n3w.id, n4k[1]!.id, n4k[2]!.id]);
    expect(p.next(active, 2)).toEqual([n5g.id, n4k[0]!.id]);
    expect(p.next(active, 0)).toEqual([]);
  });

  it("offers only active Tracks, so Unlevelled ones only when made active", () => {
    const unlevelled = pathItem("word", null);
    const n5 = pathItem("word", "N5");
    expect(plan([unlevelled, n5]).next([track("N5", "word")], 5)).toEqual([n5.id]);
    expect(plan([unlevelled, n5]).next([track("unlevelled", "word")], 5)).toEqual([unlevelled.id]);
  });

  it("skips introduced and Suspended items, and Retired ones never block because they are not there", () => {
    const [a, b, c] = [1, 2, 3].map((frequency) => pathItem("kanji", "N5", { frequency }));
    const suspended = { ...b!, suspended: true };
    expect(plan([a!, suspended, c!], { introduced: [a!.id] }).next(TRACKS, 5)).toEqual([c!.id]);
  });

  it("offers a Suspended item next once it has an approved Example, because it sits earlier", () => {
    const [a, b] = [1, 300].map((frequency) => pathItem("kanji", "N5", { frequency }));
    expect(plan([a!, b!], { introduced: [b!.id] }).next(TRACKS, 1)).toEqual([a!.id]);
  });

  it("moves a re-levelled item to its new level's Track", () => {
    const word = pathItem("word", "N3");
    expect(plan([word]).next([track("N5", "word")], 5)).toEqual([]);
    expect(plan([{ ...word, level: "N5" }]).next([track("N5", "word")], 5)).toEqual([word.id]);
  });

  it("pulls in same-level dependencies just before the item, on top of the batch size, from any Track", () => {
    const kanji = pathItem("kanji", "N5", { frequency: 1000 });
    const otherKanji = pathItem("kanji", "N5", { frequency: 1 });
    const n3Kanji = pathItem("kanji", "N3");
    const suspendedKanji = pathItem("kanji", "N5", { suspended: true });
    const word = pathItem("word", "N5", { dependsOn: [kanji.id, n3Kanji.id, suspendedKanji.id] });
    const grammar = pathItem("grammar_point", "N5");
    const clip = pathItem("listening_clip", "N5", { dependsOn: [word.id, grammar.id] });
    const p = plan([kanji, otherKanji, n3Kanji, suspendedKanji, word, grammar, clip]);
    expect(p.next([track("N5", "listening_clip")], 1)).toEqual([kanji.id, word.id, grammar.id, clip.id]);
    expect(p.next([track("N5", "kanji"), track("N5", "word"), track("N5", "grammar_point")], 3)).toEqual([
      otherKanji.id, kanji.id, word.id, grammar.id,
    ]);
  });

  it("skips an item its Track reaches after it was pulled in or introduced", () => {
    const kanji = pathItem("kanji", "N5", { frequency: 1 });
    const later = pathItem("kanji", "N5", { frequency: 1000 });
    const word = pathItem("word", "N5", { dependsOn: [later.id], priorityTags: ["nf01"] });
    const p = plan([kanji, later, word]);
    expect(p.next([track("N5", "word"), track("N5", "kanji")], 3)).toEqual([kanji.id, later.id, word.id]);
    expect(plan([kanji, later, word], { introduced: [later.id] }).next([track("N5", "word")], 3)).toEqual([word.id]);
  });
});

describe("forItem and isLocked", () => {
  const [first, second] = [1, 300].map((frequency) => pathItem("kanji", "N5", { frequency }));
  const word = pathItem("word", "N5", { dependsOn: [second!.id] });
  const items = [first!, second!, word];

  it("returns any item after its dependencies not yet introduced, for Learn now", () => {
    expect(plan(items).forItem(word.id)).toEqual([second!.id, word.id]);
    expect(plan(items, { introduced: [second!.id] }).forItem(word.id)).toEqual([word.id]);
    expect(plan(items).forItem("missing")).toEqual([]);
  });

  it("unlocks only the next item of each Track and every introduced item", () => {
    const p = plan(items, { introduced: [second!.id] });
    expect(p.isLocked(first!.id)).toBe(false);
    expect(p.isLocked(second!.id)).toBe(false);
    expect(p.isLocked(word.id)).toBe(false);
    expect(plan(items).isLocked(second!.id)).toBe(true);
    expect(plan([{ ...first!, suspended: true }]).isLocked(first!.id)).toBe(true);
    expect(plan(items).isLocked("missing")).toBe(true);
  });
});
