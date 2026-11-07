import type { Example } from "@mojibun/content-graph";
import type { Lesson } from "../contract.ts";
import type { TaughtPage } from "./prompt.ts";

const detail = (label: string, values: string[]) => (values.length ? [{ label, value: values.join(" / ") }] : []);

/** What a lesson says about a Study Item, as a title, a reading, meanings and labelled details. */
const factsOf = ({ item }: TaughtPage): Pick<Lesson, "title" | "reading" | "meanings" | "details"> => {
  switch (item.type) {
    case "kanji":
      return {
        title: item.literal,
        reading: null,
        meanings: item.meanings,
        details: [...detail("On'yomi", item.onReadings), ...detail("Kun'yomi", item.kunReadings), { label: "Strokes", value: String(item.strokeCount) }],
      };
    case "word":
      return {
        title: item.forms[0]?.text ?? item.readings[0]?.text ?? "",
        reading: item.readings[0]?.text ?? null,
        meanings: item.senses.map((s) => s.glosses.join("; ")),
        details: detail("Part of speech", item.senses[0]?.partsOfSpeech ?? []),
      };
    case "grammar_point":
      return {
        title: item.title,
        reading: null,
        meanings: [item.meaning],
        details: [...detail("Formation", item.formation), { label: "Register", value: item.register }, ...(item.notes ? [{ label: "Notes", value: item.notes }] : [])],
      };
  }
};

export const lessonOf = (page: TaughtPage, example: Example, japaneseExplanation: string | null): Lesson => ({
  studyItemId: page.item.id,
  type: page.item.type,
  ...factsOf(page),
  japaneseExplanation,
  example: { japanese: example.sentence.text, translationEn: example.sentence.translationEn },
});
