import type { Approval, Token } from "../schema.ts";
import { emptyGraph, type Graph } from "../graph.ts";

/** A tiny graph that exercises every visibility, override and level rule the contract tests check. */
export const fixture = () => {
  let n = 0;
  const next = () => `00000000-0000-7000-8000-${(++n).toString().padStart(12, "0")}`;
  const graph: Graph = emptyGraph();
  const provenanceId = next();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
  const life = (approval: Approval = "approved", retired = false) => ({ approval, retired, provenanceId });

  const item = (type: Graph["studyItem"][number]["type"], approval?: Approval, retired?: boolean) => {
    const id = next();
    graph.studyItem.push({ id, type, ...life(approval, retired) });
    return id;
  };
  const level = (studyItemId: string, lvl: Graph["levelCandidate"][number]["level"], kind: Graph["levelCandidate"][number]["kind"], approval?: Approval, retired?: boolean) =>
    graph.levelCandidate.push({ id: next(), studyItemId, level: lvl, kind, ...life(approval, retired) });
  const word = (forms: string[], reading: string, glosses: string[], approval?: Approval, retired?: boolean) => {
    const id = item("word", approval, retired);
    graph.word.push({ studyItemId: id, priorityTags: ["ichi1"] });
    const formIds = forms.map((text, position) => {
      const formId = next();
      graph.wordForm.push({ id: formId, wordId: id, position, text, ...life() });
      return formId;
    });
    const readingId = next();
    graph.wordReading.push({ id: readingId, wordId: id, position: 0, text: reading, pitchAccent: null, ...life() });
    const senseId = next();
    graph.wordSense.push({ id: senseId, wordId: id, position: 0, partsOfSpeech: ["v1"], glosses, ...life() });
    return { id, formId: formIds[0]!, readingId, senseId };
  };

  const shoku = item("kanji");
  graph.kanji.push({
    studyItemId: shoku, literal: "食", meanings: ["eat", "food"], onReadings: ["ショク"], kunReadings: ["た.べる"],
    grade: 2, frequency: 328, strokeCount: 9, components: ["人", "良"], strokes: ["M1,2"],
    knownWrongMeanings: [{ answer: "drink", explanation: "That is 飲." }],
  });
  level(shoku, "N4", "list");

  const taberu = word(["食べる"], "たべる", ["to eat", "to devour"]);
  const taberuSecondForm = next();
  graph.wordForm.push(
    { id: next(), wordId: taberu.id, position: 2, text: "retired form", ...life("approved", true) },
    { id: taberuSecondForm, wordId: taberu.id, position: 1, text: "喰べる", ...life() },
  );
  graph.wordSense.push({ id: next(), wordId: taberu.id, position: 1, partsOfSpeech: ["v1"], glosses: ["draft sense"], ...life("draft") });
  graph.japaneseExplanation.push(
    { id: next(), wordSenseId: taberu.senseId, grammarPointId: null, text: "古い説明。", ...life() },
    { id: next(), wordSenseId: taberu.senseId, grammarPointId: null, text: "食べ物を口に入れて、かんで飲みこむこと。", ...life() },
    { id: next(), wordSenseId: taberu.senseId, grammarPointId: null, text: "下書き。", ...life("draft") },
  );
  graph.override.push(
    { id: next(), recordId: taberu.senseId, field: "glosses", value: ["to eat", "to gobble"], basedOn: null, state: "active", ...life() },
    { id: next(), recordId: taberu.senseId, field: "glosses", value: ["to eat", "to consume"], basedOn: null, state: "active", ...life() },
    { id: next(), recordId: taberu.senseId, field: "glosses", value: ["stale"], basedOn: null, state: "stale", ...life() },
    { id: next(), recordId: taberu.senseId, field: "glosses", value: ["draft"], basedOn: null, state: "active", ...life("draft") },
  );
  level(taberu.id, "N4", "list");
  level(taberu.id, "N5", "editorial");
  level(taberu.id, "N3", "editorial", "draft");
  graph.wordContainsKanji.push({ id: next(), wordId: taberu.id, kanjiId: shoku, position: 0, ...life() });

  const nomu = word(["飲む"], "のむ", ["to drink"]);
  level(nomu.id, "N3", "derived");
  level(nomu.id, "N4", "list");
  level(nomu.id, "N1", "editorial", "approved", true);
  const nomuKanji = item("kanji");
  graph.kanji.push({
    studyItemId: nomuKanji, literal: "飲", meanings: ["drink"], onReadings: [], kunReadings: ["の.む"],
    grade: 3, frequency: 969, strokeCount: 12, components: [], strokes: [], knownWrongMeanings: [],
  });

  const draftWord = word(["draftword"], "どらふと", ["draft"], "draft");
  const rejectedWord = word(["rejectedword"], "りじぇくと", ["rejected"], "rejected");
  const retiredWord = word(["retiredword"], "りたいあ", ["retired"], "approved", true);
  level(draftWord.id, "N5", "list");
  level(retiredWord.id, "N5", "list");
  graph.wordContainsKanji.push({ id: next(), wordId: retiredWord.id, kanjiId: shoku, position: 0, ...life() });
  graph.wordContainsKanji.push({ id: next(), wordId: nomu.id, kanjiId: shoku, position: 0, ...life("draft") });

  const tokens: Token[] = [
    { surface: "パン", reading: "パン", lemma: "パン", partOfSpeech: ["名詞"], conjugationForm: null, start: 0, end: 2 },
    { surface: "を", reading: "ヲ", lemma: "を", partOfSpeech: ["助詞"], conjugationForm: null, start: 2, end: 3 },
    { surface: "食べる", reading: "タベル", lemma: "食べる", partOfSpeech: ["動詞"], conjugationForm: "終止形", start: 3, end: 6 },
    { surface: "。", reading: "。", lemma: "。", partOfSpeech: ["補助記号"], conjugationForm: null, start: 6, end: 7 },
  ];
  const sentence = next();
  graph.sentence.push({ id: sentence, text: "パンを食べる。", translationEn: "I eat bread.", tokens, audioKey: "audio/s1.ogg", audioVoice: "四国めたん", unlevelledWordCount: 0, ...life() });
  const draftSentence = next();
  graph.sentence.push({ id: draftSentence, text: "水を飲む。", translationEn: "I drink water.", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life("draft") });

  const exampleOf = (studyItemId: string, sentenceId: string, approval?: Approval) => {
    const exId = next();
    graph.example.push({ id: exId, sentenceId, studyItemId, spanStart: 3, spanEnd: 6, targetSenseId: null, hint: "eat", comprehensionQuestion: null, ...life(approval) });
    return exId;
  };
  const taberuExample = exampleOf(taberu.id, sentence);
  exampleOf(taberu.id, sentence, "draft");
  exampleOf(nomu.id, draftSentence);
  const answer = (kind: Graph["exampleAnswer"][number]["kind"], written: string, reading: string | null, message: string | null, approval?: Approval) => {
    const answerId = next();
    graph.exampleAnswer.push({ id: answerId, exampleId: taberuExample, kind, written, reading, message, ...life(approval) });
    return answerId;
  };
  const accepted = answer("accepted", "食べる", "たべる", null);
  const alternate = answer("alternate", "食う", null, "That works, but we want the neutral verb.");
  const knownWrong = answer("known_wrong", "飲む", null, "飲む is to drink.");
  answer("accepted", "たべる", "たべる", null, "draft");
  graph.sentenceUsesWord.push({ id: next(), sentenceId: sentence, wordId: taberu.id, formId: taberu.formId, readingId: taberu.readingId, senseId: taberu.senseId, spanStart: 3, spanEnd: 6, ...life() });
  graph.override.push({ id: next(), recordId: sentence, field: "audioKey", value: "audio/s1.ogg", basedOn: null, state: "active", ...life() });

  const grammar = (title: string, meaning: string, explanation: string | null) => {
    const gid = item("grammar_point");
    graph.grammarPoint.push({ studyItemId: gid, title, forms: [{ text: title, register: "casual" }], formation: ["V-て", "しまう"], register: "neutral", meaning, notes: null, matcherRule: null });
    if (explanation) graph.japaneseExplanation.push({ id: next(), wordSenseId: null, grammarPointId: gid, text: explanation, ...life() });
    return gid;
  };
  const teshimau = grammar("〜てしまう", "to do completely", "動作が完了したことや、残念な気持ちを表す。");
  graph.override.push({ id: next(), recordId: teshimau, field: "meaning", value: "to do completely; to do by mistake", basedOn: "to do completely", state: "active", ...life() });
  const chau = grammar("〜ちゃう", "casual てしまう", null);
  level(teshimau, "N4", "list");
  level(teshimau, "N3", "list");
  level(chau, "N4", "list", "draft");
  graph.grammarRelatesTo.push(
    { id: next(), fromId: teshimau, toId: chau, kind: "contrast", comparison: "ちゃう is the casual contraction.", ...life() },
    { id: next(), fromId: teshimau, toId: chau, kind: "see_also", comparison: null, ...life("rejected") },
  );

  const clip = item("listening_clip");
  graph.listeningClip.push({ studyItemId: clip, kind: "sentence" });
  graph.clipVoicesSentence.push(
    { id: next(), clipId: clip, sentenceId: sentence, position: 0, speaker: "女", voice: "四国めたん", audioKey: "audio/clip.ogg", ...life() },
    { id: next(), clipId: clip, sentenceId: draftSentence, position: 1, speaker: "男", voice: "玄野武宏", audioKey: null, ...life() },
  );

  const clipAtN5 = item("listening_clip");
  graph.listeningClip.push({ studyItemId: clipAtN5, kind: "sentence" });
  level(clipAtN5, "N5", "derived");
  const retiredClip = item("listening_clip", "approved", true);
  graph.listeningClip.push({ studyItemId: retiredClip, kind: "sentence" });
  level(retiredClip, "N5", "derived");
  const draftClip = item("listening_clip", "draft");
  graph.listeningClip.push({ studyItemId: draftClip, kind: "dialogue" });
  level(draftClip, "N5", "derived");

  const passage = next();
  graph.readingPassage.push({ id: passage, title: "朝ごはん", form: "prose", comprehensionQuestions: [], ...life() });
  graph.passageContainsSentence.push({ id: next(), passageId: passage, sentenceId: sentence, position: 0, ...life() });
  graph.sentenceDemonstratesGrammar.push({ id: next(), sentenceId: sentence, grammarPointId: teshimau, spanStart: 0, spanEnd: 1, ...life("draft") });
  graph.wordSupersededBy.push({ id: next(), retiredWordId: retiredWord.id, wordId: taberu.id, ...life() });
  graph.sourceKey.push({ dataset: "jmdict", upstreamKey: "1358280", recordId: taberu.id });

  return {
    graph,
    tokens,
    ids: {
      taberu: taberu.id, taberuForm: taberu.formId, taberuReading: taberu.readingId, taberuSense: taberu.senseId, taberuSecondForm,
      taberuExample, accepted, alternate, knownWrong, sentence,
      nomu: nomu.id, shoku, teshimau, chau, clip, clipAtN5, retiredClip, draftClip,
      draftWord: draftWord.id, rejectedWord: rejectedWord.id, retiredWord: retiredWord.id,
      missing: next(),
    },
  };
};
