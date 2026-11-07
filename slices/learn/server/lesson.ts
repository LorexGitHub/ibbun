import type { Example, GrammarPoint, Kanji, Word } from "@mojibun/content-graph";
import type { Lesson } from "../contract.ts";
import type { TaughtPage } from "./prompt.ts";

type Facts = Pick<Lesson, "title" | "reading" | "meanings" | "details">;

const detail = (label: string, values: string[]) => (values.length ? [{ label, value: values.join(" / ") }] : []);

const kanjiFacts = (kanji: Kanji): Facts => ({
  title: kanji.literal,
  reading: null,
  meanings: kanji.meanings,
  details: [...detail("On'yomi", kanji.onReadings), ...detail("Kun'yomi", kanji.kunReadings), { label: "Strokes", value: String(kanji.strokeCount) }],
});

/** A Word with no written form in kanji is taught by its reading. */
const wordFacts = (word: Word): Facts => ({
  title: word.forms[0]?.text ?? word.readings[0]!.text,
  reading: word.readings[0]!.text,
  meanings: word.senses.map((s) => s.glosses.join("; ")),
  details: detail("Part of speech", word.senses[0]!.partsOfSpeech),
});

const grammarFacts = (point: GrammarPoint): Facts => ({
  title: point.title,
  reading: null,
  meanings: [point.meaning],
  details: [...detail("Formation", point.formation), { label: "Register", value: point.register }, ...(point.notes ? [{ label: "Notes", value: point.notes }] : [])],
});

const factsOf = ({ item }: TaughtPage): Facts => {
  if (item.type === "kanji") return kanjiFacts(item);
  return item.type === "word" ? wordFacts(item) : grammarFacts(item);
};

/** What a lesson says about a Study Item, with the Example that shows it. */
export const lessonOf = (page: TaughtPage, example: Example, japaneseExplanation: string | null): Lesson => ({
  studyItemId: page.item.id,
  type: page.item.type,
  ...factsOf(page),
  japaneseExplanation,
  example: { japanese: example.sentence.text, translationEn: example.sentence.translationEn },
});
