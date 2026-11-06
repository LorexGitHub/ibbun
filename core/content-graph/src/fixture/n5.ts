import type { StudyItemId } from "@mojibun/shared";
import { emptyGraph, type Graph } from "../graph.ts";

/**
 * The hand-made N5 fixture graph for dev and test (#58): mojibun-owned content, all rights
 * reserved, written by an agent. Every Study Item has two approved Examples that meet the
 * approval rule (docs/review-answer-model.md#approval-rule).
 */

/** One Example Sentence: `target` is the substring the Example tests, `reading` its kana. */
type Line = { text: string; en: string; target: string; reading: string; hint: string };

type KanjiData = { literal: string; meanings: string[]; on: string[]; kun: string[]; strokes: number; grade: number };
type WordData = { form: string; reading: string; glosses: string[]; pos: string[]; explanation: string; kanji: Record<string, string>; lines: [Line, Line] };
type GrammarData = { title: string; formation: string[]; meaning: string; explanation: string; lines: [Line, Line] };

const KANJI: KanjiData[] = [
  { literal: "日", meanings: ["day", "sun", "Japan"], on: ["ニチ", "ジツ"], kun: ["ひ", "-か"], strokes: 4, grade: 1 },
  { literal: "月", meanings: ["month", "moon"], on: ["ゲツ", "ガツ"], kun: ["つき"], strokes: 4, grade: 1 },
  { literal: "火", meanings: ["fire"], on: ["カ"], kun: ["ひ"], strokes: 4, grade: 1 },
  { literal: "水", meanings: ["water"], on: ["スイ"], kun: ["みず"], strokes: 4, grade: 1 },
  { literal: "木", meanings: ["tree", "wood"], on: ["ボク", "モク"], kun: ["き"], strokes: 4, grade: 1 },
  { literal: "金", meanings: ["gold", "money"], on: ["キン", "コン"], kun: ["かね"], strokes: 8, grade: 1 },
  { literal: "土", meanings: ["soil", "earth"], on: ["ド", "ト"], kun: ["つち"], strokes: 3, grade: 1 },
  { literal: "山", meanings: ["mountain"], on: ["サン"], kun: ["やま"], strokes: 3, grade: 1 },
  { literal: "川", meanings: ["river"], on: ["セン"], kun: ["かわ"], strokes: 3, grade: 1 },
  { literal: "人", meanings: ["person"], on: ["ジン", "ニン"], kun: ["ひと"], strokes: 2, grade: 1 },
];

const line = (text: string, en: string, target: string, reading: string, hint: string): Line => ({ text, en, target, reading, hint });

const WORDS: WordData[] = [
  { form: "日本", reading: "にほん", glosses: ["Japan"], pos: ["n"], kanji: { "日": "に" }, explanation: "アジアの東にある国。",
    lines: [line("日本はきれいな国です。", "Japan is a beautiful country.", "日本", "にほん", "Japan"),
            line("日本に行きたいです。", "I want to go to Japan.", "日本", "にほん", "Japan")] },
  { form: "月", reading: "つき", glosses: ["moon"], pos: ["n"], kanji: { "月": "つき" }, explanation: "夜の空に見える、丸く光るもの。",
    lines: [line("今日は月がきれいです。", "The moon is beautiful tonight.", "月", "つき", "moon"),
            line("月を見ました。", "I looked at the moon.", "月", "つき", "moon")] },
  { form: "火", reading: "ひ", glosses: ["fire", "flame"], pos: ["n"], kanji: { "火": "ひ" }, explanation: "物がもえるときに出る、あつくて赤いもの。",
    lines: [line("火に気をつけてください。", "Please be careful with fire.", "火", "ひ", "fire"),
            line("火がつきません。", "The fire won't light.", "火", "ひ", "fire")] },
  { form: "水", reading: "みず", glosses: ["water"], pos: ["n"], kanji: { "水": "みず" }, explanation: "のむことができる、色のないもの。",
    lines: [line("水をください。", "Water, please.", "水", "みず", "water"),
            line("毎朝水を飲みます。", "I drink water every morning.", "水", "みず", "water")] },
  { form: "木", reading: "き", glosses: ["tree"], pos: ["n"], kanji: { "木": "き" }, explanation: "地面から高く大きくのびる植物。",
    lines: [line("庭に木があります。", "There is a tree in the garden.", "木", "き", "tree"),
            line("あの木は高いです。", "That tree is tall.", "木", "き", "tree")] },
  { form: "お金", reading: "おかね", glosses: ["money"], pos: ["n"], kanji: { "金": "かね" }, explanation: "物を買うときにはらうもの。",
    lines: [line("お金がありません。", "I have no money.", "お金", "おかね", "money"),
            line("銀行でお金を出します。", "I take out money at the bank.", "お金", "おかね", "money")] },
  { form: "土", reading: "つち", glosses: ["soil", "earth"], pos: ["n"], kanji: { "土": "つち" }, explanation: "地面の、やわらかい茶色のもの。",
    lines: [line("手に土がつきました。", "I got soil on my hands.", "土", "つち", "soil"),
            line("この土はやわらかいです。", "This soil is soft.", "土", "つち", "soil")] },
  { form: "山", reading: "やま", glosses: ["mountain"], pos: ["n"], kanji: { "山": "やま" }, explanation: "まわりより高くなっている、大きな土地。",
    lines: [line("山に登りました。", "I climbed a mountain.", "山", "やま", "mountain"),
            line("あの山は高いです。", "That mountain is high.", "山", "やま", "mountain")] },
  { form: "川", reading: "かわ", glosses: ["river"], pos: ["n"], kanji: { "川": "かわ" }, explanation: "水が長く流れているところ。",
    lines: [line("川で泳ぎました。", "I swam in the river.", "川", "かわ", "river"),
            line("家の近くに川があります。", "There is a river near my house.", "川", "かわ", "river")] },
  { form: "人", reading: "ひと", glosses: ["person"], pos: ["n"], kanji: { "人": "ひと" }, explanation: "わたしたちのこと。男の人や女の人。",
    lines: [line("あの人は先生です。", "That person is a teacher.", "人", "ひと", "person"),
            line("店に人がたくさんいます。", "There are many people in the shop.", "人", "ひと", "person")] },
];

const GRAMMAR: GrammarData[] = [
  { title: "〜です", formation: ["N", "です"], meaning: "to be (polite)", explanation: "文の終わりにつけて、ていねいに言う。",
    lines: [line("わたしは学生です。", "I am a student.", "です", "です", "is (polite)"),
            line("これはペンです。", "This is a pen.", "です", "です", "is (polite)")] },
  { title: "〜は", formation: ["N", "は"], meaning: "topic marker", explanation: "話のテーマをしめす。",
    lines: [line("わたしは田中です。", "I am Tanaka.", "は", "は", "topic"),
            line("今日は月曜日です。", "Today is Monday.", "は", "は", "topic")] },
  { title: "〜が", formation: ["N", "が"], meaning: "subject marker", explanation: "動作や様子の主をしめす。",
    lines: [line("雨が降っています。", "It is raining.", "が", "が", "subject"),
            line("犬がいます。", "There is a dog.", "が", "が", "subject")] },
  { title: "〜を", formation: ["N", "を", "V"], meaning: "direct object marker", explanation: "動作をうけるものをしめす。",
    lines: [line("パンを食べます。", "I eat bread.", "を", "を", "object"),
            line("本を読みます。", "I read a book.", "を", "を", "object")] },
  { title: "〜に (destination)", formation: ["N", "に", "行く／来る"], meaning: "to (a place)", explanation: "行くところや来るところをしめす。",
    lines: [line("学校に行きます。", "I go to school.", "に", "に", "to (a place)"),
            line("東京に来ました。", "I came to Tokyo.", "に", "に", "to (a place)")] },
  { title: "〜で (place of action)", formation: ["N", "で", "V"], meaning: "at, in (where an action happens)", explanation: "動作をするところをしめす。",
    lines: [line("図書館で勉強します。", "I study at the library.", "で", "で", "at (action)"),
            line("公園で遊びます。", "I play in the park.", "で", "で", "at (action)")] },
  { title: "〜も", formation: ["N", "も"], meaning: "also, too", explanation: "ほかと同じであることをしめす。",
    lines: [line("わたしも行きます。", "I will go too.", "も", "も", "also"),
            line("これも好きです。", "I like this too.", "も", "も", "also")] },
  { title: "〜の", formation: ["N", "の", "N"], meaning: "possessive, of", explanation: "持ち主や、何についてかをしめす。",
    lines: [line("これはわたしの本です。", "This is my book.", "の", "の", "'s / of"),
            line("日本語の先生です。", "She is a Japanese teacher.", "の", "の", "'s / of")] },
  { title: "〜か", formation: ["文", "か"], meaning: "question marker", explanation: "文の終わりにつけて、しつもんにする。",
    lines: [line("学生ですか。", "Are you a student?", "か", "か", "question"),
            line("コーヒーを飲みますか。", "Do you drink coffee?", "か", "か", "question")] },
  { title: "〜ません", formation: ["V-ます stem", "ません"], meaning: "do not (polite negative)", explanation: "ていねいに、しないことを言う。",
    lines: [line("肉を食べません。", "I don't eat meat.", "ません", "ません", "don't (polite)"),
            line("今日は行きません。", "I'm not going today.", "ません", "ません", "don't (polite)")] },
];

/** Fixture ids are fixed so a reload finds what an earlier load wrote. */
const fixtureId = (n: number) => `00000058-0000-7000-8000-${n.toString().padStart(12, "0")}`;
export const FIXTURE_PROVENANCE_ID = fixtureId(0);

const spanOf = (text: string, target: string) => {
  const start = text.indexOf(target);
  if (start < 0) throw new Error(`fixture: "${target}" is not in "${text}"`);
  return { spanStart: start, spanEnd: start + target.length };
};

export type N5Fixture = { graph: Graph; ids: { kanji: Ids; words: Ids; grammar: Ids } };
type Ids = Record<string, StudyItemId>;

/** Builds the N5 fixture graph. Pure: each call returns a fresh copy. */
export const n5Fixture = (): N5Fixture => {
  let n = 0;
  const next = () => fixtureId(++n);
  const graph = emptyGraph();
  const life = { approval: "approved" as const, retired: false, provenanceId: FIXTURE_PROVENANCE_ID };
  graph.provenance.push({ id: FIXTURE_PROVENANCE_ID, source: { kind: "fixture" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });

  const studyItem = (type: Graph["studyItem"][number]["type"]) => {
    const id = next() as StudyItemId;
    graph.studyItem.push({ id, type, ...life });
    graph.levelCandidate.push({ id: next(), studyItemId: id, level: "N5", kind: "editorial", ...life });
    return id;
  };
  const sentence = (l: Line) => {
    const id = next();
    graph.sentence.push({ id, text: l.text, translationEn: l.en, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
    return id;
  };
  const example = (studyItemId: string, sentenceId: string, l: Line, target: string, reading: string, targetSenseId: string | null) => {
    const id = next();
    graph.example.push({ id, sentenceId, studyItemId, ...spanOf(l.text, target), targetSenseId, hint: l.hint, comprehensionQuestion: null, ...life });
    graph.exampleAnswer.push({ id: next(), exampleId: id, kind: "accepted", written: target, reading, message: null, ...life });
  };

  const kanji: Ids = {};
  for (const k of KANJI) {
    kanji[k.literal] = studyItem("kanji");
    graph.kanji.push({
      studyItemId: kanji[k.literal]!, literal: k.literal, meanings: k.meanings, onReadings: k.on, kunReadings: k.kun,
      grade: k.grade, frequency: null, strokeCount: k.strokes, components: [], strokes: [], knownWrongMeanings: [],
    });
  }

  const words: Ids = {};
  for (const w of WORDS) {
    const id = studyItem("word");
    words[w.form] = id;
    graph.word.push({ studyItemId: id, priorityTags: ["ichi1"] });
    const formId = next();
    const readingId = next();
    const senseId = next();
    graph.wordForm.push({ id: formId, wordId: id, position: 0, text: w.form, ...life });
    graph.wordReading.push({ id: readingId, wordId: id, position: 0, text: w.reading, pitchAccent: null, ...life });
    graph.wordSense.push({ id: senseId, wordId: id, position: 0, partsOfSpeech: w.pos, glosses: w.glosses, ...life });
    graph.japaneseExplanation.push({ id: next(), wordSenseId: senseId, grammarPointId: null, text: w.explanation, ...life });
    Object.keys(w.kanji).forEach((literal) =>
      graph.wordContainsKanji.push({ id: next(), wordId: id, kanjiId: kanji[literal]!, position: w.form.indexOf(literal), ...life }),
    );
    for (const l of w.lines) {
      const sentenceId = sentence(l);
      graph.sentenceUsesWord.push({ id: next(), sentenceId, wordId: id, formId, readingId, senseId, ...spanOf(l.text, l.target), ...life });
      example(id, sentenceId, l, l.target, l.reading, null);
      for (const [literal, reading] of Object.entries(w.kanji)) example(kanji[literal]!, sentenceId, l, literal, reading, senseId);
    }
  }

  const grammar: Ids = {};
  for (const g of GRAMMAR) {
    const id = studyItem("grammar_point");
    grammar[g.title] = id;
    const text = g.title.replace(/^〜| \(.*\)$/g, "");
    graph.grammarPoint.push({ studyItemId: id, title: g.title, forms: [{ text, register: "polite" }], formation: g.formation, register: "neutral", meaning: g.meaning, notes: null, matcherRule: null });
    graph.japaneseExplanation.push({ id: next(), wordSenseId: null, grammarPointId: id, text: g.explanation, ...life });
    for (const l of g.lines) {
      const sentenceId = sentence(l);
      graph.sentenceDemonstratesGrammar.push({ id: next(), sentenceId, grammarPointId: id, ...spanOf(l.text, l.target), ...life });
      example(id, sentenceId, l, l.target, l.reading, null);
    }
  }

  return { graph, ids: { kanji, words, grammar } };
};
