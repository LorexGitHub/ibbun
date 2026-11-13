import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Authoring, GenerationRun } from "@ibbun/content-graph/authoring";
import { definePlan, type Kind } from "../kind.ts";
import { targetOf, type Target } from "./subject.ts";

export const TEMPLATE_VERSION = "explanation/1";
const WIKTIONARY = "wiktionary-ja";

export const Explanation = z.object({ text: z.string().min(1) });
type Explanation = z.output<typeof Explanation>;

const SYSTEM = `You write short Japanese explanations of word meanings and grammar patterns for JLPT learners, in the style of a dictionary for learners. Write only in Japanese, in plain kana and common kanji, using only vocabulary and grammar at or below the stated JLPT level. Explain the meaning; do not use the headword itself and do not restate a synonym. Answer only in the requested JSON shape.`;

type Reference = { id: string; text: string };

/** The explanations the target already has, apart from any that was rejected. */
const existing = (auth: Authoring, target: Target) =>
  auth.rows("japaneseExplanation", target.wordSenseId ? { wordSenseId: target.wordSenseId } : { grammarPointId: target.grammarPointId! });

const isWiktionary = async (auth: Authoring, provenanceId: string): Promise<boolean> => {
  const [provenance] = await auth.rows("provenance", { id: provenanceId });
  if (provenance?.source.kind !== "import") return false;
  const [run] = await auth.rows("importRun", { id: provenance.source.importRunId });
  return run?.dataset === WIKTIONARY;
};

/** The ja Wiktionary entry for the target, if the seed has one: the reviewer's reference (grammar-points.md#fields). */
const wiktionaryEntries = async (auth: Authoring, target: Target): Promise<Reference[]> => {
  const found: Reference[] = [];
  for (const e of await existing(auth, target)) {
    if (e.approval !== "rejected" && !e.retired && (await isWiktionary(auth, e.provenanceId))) found.push({ id: e.id, text: e.text });
  }
  return found;
};

const write = async (auth: Authoring, target: Target, references: Reference[], { text }: Explanation, run: GenerationRun) => {
  const provenanceId = randomUUID();
  await auth.insert("provenance", [
    {
      id: provenanceId,
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "ibbun",
      author: null,
      sourceUrl: null,
      inputs: [...target.recordIds, ...references.map((r) => r.id)],
    },
  ]);
  await auth.insert("japaneseExplanation", [
    { id: randomUUID(), wordSenseId: target.wordSenseId, grammarPointId: target.grammarPointId, text, approval: "draft", retired: false, provenanceId },
  ]);
};

/** A Japanese Explanation for a Word sense ja Wiktionary doesn't cover, or for a Grammar Point (content-approval.md#what-is-generated). */
export const explanation: Kind = {
  name: "explanation",
  async plan(auth, request, feedback) {
    const target = await targetOf(auth, request.targetId);
    if (!target) return null;
    const references = await wiktionaryEntries(auth, target);
    // A sense with an explanation, from Wiktionary or an earlier attempt that is still live, has nothing to generate.
    if (target.wordSenseId && (await existing(auth, target)).some((e) => e.approval !== "rejected" && !e.retired)) return null;
    const referenceLines = references.map((r) => `Reference, ja Wiktionary (do not copy it): ${r.text}`);
    return definePlan({
      templateVersion: TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `Write a Japanese explanation of this ${target.wordSenseId ? "Word sense" : "Grammar Point"} for a learner at JLPT level ${target.level}.`,
        ...target.facts,
        ...referenceLines,
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: Explanation,
      inputs: [...target.facts, ...referenceLines],
      write: (output, run) => write(auth, target, references, output, run),
    });
  },
};
