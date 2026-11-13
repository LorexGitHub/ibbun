import type { Authoring } from "@ibbun/content-graph/authoring";
import type { JlptLevel } from "@ibbun/shared";
import { subjectOf } from "../example-sentence/subject.ts";

/** What a Japanese Explanation explains: one Word sense or one Grammar Point. */
export type Target = {
  /** Set for a Word sense, null for a Grammar Point. */
  wordSenseId: string | null;
  grammarPointId: string | null;
  level: JlptLevel;
  /** What the prompt says about it. */
  facts: string[];
  /** Every record the facts came from. */
  recordIds: string[];
};

const approved = { approval: "approved", retired: false } as const;

const senseTarget = async (auth: Authoring, senseId: string): Promise<Target | null> => {
  const [sense] = await auth.rows("wordSense", { id: senseId, ...approved });
  const word = sense && (await subjectOf(auth, sense.wordId));
  if (!sense || word?.type !== "word") return null;
  const others = new Set((await auth.rows("wordSense", { wordId: sense.wordId })).filter((s) => s.id !== senseId).map((s) => s.id));
  return {
    wordSenseId: senseId,
    grammarPointId: null,
    level: word.level,
    facts: [...word.facts.filter((f) => !f.startsWith("Meaning:")), `Meaning: ${sense.glosses.join("; ")} (${sense.partsOfSpeech.join(", ")})`],
    recordIds: word.recordIds.filter((id) => !others.has(id)),
  };
};

const grammarTarget = async (auth: Authoring, id: string): Promise<Target | null> => {
  const point = await subjectOf(auth, id);
  if (point?.type !== "grammar_point") return null;
  return { wordSenseId: null, grammarPointId: id, level: point.level, facts: point.facts, recordIds: point.recordIds };
};

/** The Word sense or Grammar Point behind a request, or null if it is gone or not approved. */
export const targetOf = async (auth: Authoring, id: string): Promise<Target | null> =>
  (await senseTarget(auth, id)) ?? (await grammarTarget(auth, id));
