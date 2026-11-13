import type { Attribution, Example as CoreExample, StudyItem, StudyItemLink, StudyItemPage, StudyItemSummary } from "@ibbun/content-graph";
import type { Credit, Detail, Example, ItemPage, Related, Summary } from "../contract.ts";

/** Only credits whose licence asks for one beside the content; the rest go on the Credits page. */
export const creditsOf = (attribution: Attribution): Credit[] =>
  attribution
    .filter((c) => c.inline)
    .map((c) => ({ text: [c.author, c.dataset ?? c.licenceName].filter(Boolean).join(" · "), ...(c.url ? { href: c.url } : {}) }));

export const summaryOf = (s: StudyItemSummary): Summary => ({ id: s.id, type: s.type, level: s.level, label: s.label, reading: s.reading, meaning: s.meaning });

/** Null for a Listening Clip: it is practised, never browsed. */
const detailOf = (item: StudyItem): Detail | null => {
  switch (item.type) {
    case "kanji":
      return { type: "kanji", literal: item.literal, meanings: item.meanings, onReadings: item.onReadings, kunReadings: item.kunReadings, grade: item.grade, strokeCount: item.strokeCount, components: item.components };
    case "word":
      return {
        type: "word",
        forms: item.forms.map((f) => f.text),
        usuallyKana: item.usuallyKana,
        readings: item.readings.map((r) => ({ text: r.text, pitchAccent: r.pitchAccent })),
        senses: item.senses.map((s) => ({ partsOfSpeech: s.partsOfSpeech, glosses: s.glosses, japaneseExplanation: s.japaneseExplanation })),
      };
    case "grammar_point":
      return { type: "grammar_point", title: item.title, forms: item.forms, formation: item.formation, register: item.register, meaning: item.meaning, japaneseExplanation: item.japaneseExplanation, notes: item.notes };
    case "listening_clip":
      return null;
  }
};

const exampleOf = (e: CoreExample): Example => ({ id: e.id, text: e.sentence.text, translation: e.sentence.translationEn, credits: creditsOf(e.attribution) });

const RELATED_HEADINGS = { contains_kanji: "Kanji in this word", contained_in_word: "Words with this kanji", relates_to: "Related grammar" } as const;

const linkOf = (l: StudyItemLink): { heading: string; summary: Summary; note: string | null } | null => {
  switch (l.kind) {
    case "contains_kanji":
      return { heading: RELATED_HEADINGS.contains_kanji, summary: summaryOf(l.kanji), note: null };
    case "contained_in_word":
      return { heading: RELATED_HEADINGS.contained_in_word, summary: summaryOf(l.word), note: null };
    case "relates_to":
      return { heading: RELATED_HEADINGS.relates_to, summary: summaryOf(l.grammarPoint), note: l.comparison };
    case "voices":
      return null;
  }
};

/** Groups links under their headings, in the order the headings first appear. */
const relatedOf = (links: StudyItemLink[]): Related[] => {
  const groups = new Map<string, Related["items"]>();
  for (const link of links.map(linkOf)) {
    if (link) groups.set(link.heading, [...(groups.get(link.heading) ?? []), { summary: link.summary, note: link.note }]);
  }
  return [...groups].map(([heading, items]) => ({ heading, items }));
};

/** What the Learner's page shows, or null when the id is not something Browse shows. */
export const itemPageOf = ({ item, examples, links, attribution }: StudyItemPage, learner: { locked: boolean; introduced: boolean }): ItemPage | null => {
  const detail = detailOf(item);
  return detail && { id: item.id, level: item.level, ...learner, detail, examples: examples.map(exampleOf), related: relatedOf(links), credits: creditsOf(attribution) };
};
