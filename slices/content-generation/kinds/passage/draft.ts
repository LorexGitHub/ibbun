import { randomUUID } from "node:crypto";
import type { Authoring, GenerationRun } from "@mojibun/content-graph/authoring";
import type { ComprehensionQuestion } from "@mojibun/content-graph";
import { subjectOf, type Subject } from "../example-sentence/subject.ts";

/** The Study Items that exist, as the prompt describes them. */
export const subjects = async (auth: Authoring, ids: readonly string[]): Promise<Subject[]> =>
  (await Promise.all(ids.map((id) => subjectOf(auth, id)))).filter((s): s is Subject => s !== null);

export const factsOf = (items: readonly Subject[]): string[] => items.map((s) => s.facts.join(" / "));

export type PassageDraft = {
  title: string;
  form: "prose" | "dialogue";
  comprehensionQuestions: ComprehensionQuestion[];
  sentences: readonly { text: string; translationEn: string; speaker: "男" | "女" | null }[];
};

/**
 * Writes a Draft Reading Passage with generated Provenance pointing at `run`. A retry rewrites the same passage;
 * the links of the rejected attempt are retired.
 */
export const writePassageDraft = async (auth: Authoring, passageId: string, run: GenerationRun, inputs: string[], draft: PassageDraft) => {
  const provenanceId = randomUUID();
  await auth.insert("provenance", [
    {
      id: provenanceId,
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "mojibun",
      author: null,
      sourceUrl: null,
      inputs,
    },
  ]);
  const life = { approval: "draft", retired: false, provenanceId } as const;
  const passage = { title: draft.title, form: draft.form, comprehensionQuestions: draft.comprehensionQuestions, ...life };
  const [existing] = await auth.rows("readingPassage", { id: passageId });
  if (existing) {
    await auth.update("readingPassage", { id: passageId }, passage);
    await auth.update("passageContainsSentence", { passageId }, { retired: true });
  } else {
    await auth.insert("readingPassage", [{ id: passageId, ...passage }]);
  }
  for (const [position, { text, translationEn, speaker }] of draft.sentences.entries()) {
    const sentenceId = randomUUID();
    await auth.insert("sentence", [
      { id: sentenceId, text, translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
    ]);
    await auth.insert("passageContainsSentence", [{ id: randomUUID(), passageId, sentenceId, position, speaker, ...life }]);
  }
};
