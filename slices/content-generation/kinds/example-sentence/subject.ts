import type { Authoring } from "@mojibun/content-graph/authoring";
import { currentLevel } from "@mojibun/content-graph/levels";
import type { JlptLevel } from "@mojibun/shared";

/** The Study Item an Example Sentence teaches, as the prompt describes it. */
export type Subject = {
  type: "word" | "kanji" | "grammar_point";
  level: JlptLevel;
  /** What the prompt says about it. */
  facts: string[];
  /** Every record the facts came from. */
  recordIds: string[];
};

const approved = { approval: "approved", retired: false } as const;
const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

const wordFacts = async (auth: Authoring, id: string): Promise<Omit<Subject, "type" | "level"> | null> => {
  const [forms, readings, senses] = await Promise.all([
    auth.rows("wordForm", { wordId: id, ...approved }),
    auth.rows("wordReading", { wordId: id, ...approved }),
    auth.rows("wordSense", { wordId: id, ...approved }),
  ]);
  if (!forms.length && !readings.length) return null;
  return {
    facts: [
      `Word: ${byPosition(forms).map((f) => f.text).join("、")}`,
      `Reading: ${byPosition(readings).map((r) => r.text).join("、")}`,
      ...byPosition(senses).map((s) => `Meaning: ${s.glosses.join("; ")} (${s.partsOfSpeech.join(", ")})`),
    ],
    recordIds: [...forms, ...readings, ...senses].map((r) => r.id),
  };
};

const kanjiFacts = async (auth: Authoring, id: string): Promise<Omit<Subject, "type" | "level"> | null> => {
  const [kanji] = await auth.rows("kanji", { studyItemId: id });
  if (!kanji) return null;
  return {
    facts: [
      `Kanji: ${kanji.literal}`,
      `Meanings: ${kanji.meanings.join(", ")}`,
      `On readings: ${kanji.onReadings.join("、")}`,
      `Kun readings: ${kanji.kunReadings.join("、")}`,
    ],
    recordIds: [],
  };
};

const grammarFacts = async (auth: Authoring, id: string): Promise<Omit<Subject, "type" | "level"> | null> => {
  const [point] = await auth.rows("grammarPoint", { studyItemId: id });
  if (!point) return null;
  return {
    facts: [
      `Grammar Point: ${point.title}`,
      `Forms: ${point.forms.map((f) => `${f.text} (${f.register})`).join("、")}`,
      `Formation: ${point.formation.join("; ")}`,
      `Meaning: ${point.meaning}`,
      ...(point.notes ? [`Notes: ${point.notes}`] : []),
    ],
    recordIds: [],
  };
};

const FACTS = { word: wordFacts, kanji: kanjiFacts, grammar_point: grammarFacts } as const;

/** The Study Item behind a request, or null if it is gone, not approved, or not a Word, Kanji or Grammar Point. */
export const subjectOf = async (auth: Authoring, studyItemId: string): Promise<Subject | null> => {
  const [item] = await auth.rows("studyItem", { id: studyItemId, ...approved });
  if (!item || !(item.type in FACTS)) return null;
  const type = item.type as Subject["type"];
  const found = await FACTS[type](auth, studyItemId);
  if (!found) return null;
  // An unlevelled target is written for the whole range of levels (the automatic checks allow it at N1).
  const level = currentLevel(await auth.rows("levelCandidate", { studyItemId })) ?? "N1";
  return { type, level, facts: found.facts, recordIds: [studyItemId, ...found.recordIds] };
};
