import { z } from "zod";
import type { Authoring } from "@ibbun/content-graph/authoring";
import { definePlan, type Kind } from "../kind.ts";
import { CONFIDENCE, enqueueProposal } from "./queue.ts";

export const ALIGNMENT_TEMPLATE_VERSION = "sense-alignment/1";

const SYSTEM = `You align Japanese dictionary glosses to the senses of a JMdict entry. Each gloss describes at most one sense; ja Wiktionary is often finer-grained than JMdict and lists archaic or regional senses JMdict leaves out. When no sense fits a gloss, answer null for it. Answer only in the requested JSON shape.`;

const approved = { approval: "approved", retired: false } as const;

/** The Word's JMdict senses, and the draft ja Wiktionary glosses (attached provisionally to one of them) waiting to be aligned. */
const alignable = async (auth: Authoring, wordId: string) => {
  const [item] = await auth.rows("studyItem", { id: wordId, ...approved });
  if (item?.type !== "word") return null;
  const senses = (await auth.rows("wordSense", { wordId, ...approved })).sort((a, b) => a.position - b.position);
  const wiktionary = new Set((await auth.rows("sourceKey", { dataset: "wiktionary-ja" })).map((k) => k.recordId));
  const senseIds = new Set(senses.map((s) => s.id));
  const glosses = (await auth.rows("japaneseExplanation", { approval: "draft" })).filter(
    (e) => wiktionary.has(e.id) && e.wordSenseId !== null && senseIds.has(e.wordSenseId),
  );
  return senses.length && glosses.length ? { senses, glosses } : null;
};

/** Which JMdict sense each ja Wiktionary gloss of a Word belongs to (research/japanese-explanation-sources.md#sense-alignment). */
export const senseAlignment: Kind = {
  name: "sense_alignment",
  async plan(auth, request, feedback) {
    const found = await alignable(auth, request.targetId);
    if (!found) return null;
    const { senses, glosses } = found;
    const senseLines = senses.map((s, i) => `${i + 1}. ${s.glosses.join("; ")} (${s.partsOfSpeech.join(", ")})`);
    const glossLines = glosses.map((g, i) => `${i + 1}. ${g.text}`);
    return definePlan({
      templateVersion: ALIGNMENT_TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        "JMdict senses:",
        ...senseLines,
        "Wiktionary glosses:",
        ...glossLines,
        "For every gloss, give the number of the JMdict sense it describes, or null if none.",
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: z
        .object({
          alignments: z.array(
            z.object({
              gloss: z.number().int().min(1).max(glosses.length),
              sense: z.number().int().min(1).max(senses.length).nullable(),
              confidence: z.enum(CONFIDENCE),
              reason: z.string().min(1),
            }),
          ),
        })
        .refine((o) => new Set(o.alignments.map((a) => a.gloss)).size === glosses.length, { error: "every gloss needs exactly one alignment" }),
      inputs: [...senseLines, ...glossLines],
      write: async ({ alignments }, run) => {
        for (const { gloss, sense, confidence, reason } of alignments) {
          const explanation = glosses[gloss - 1]!;
          await enqueueProposal(auth, run, "sense alignment", explanation.id, {
            explanationId: explanation.id,
            currentSenseId: explanation.wordSenseId,
            proposedSenseId: sense === null ? null : senses[sense - 1]!.id,
            confidence,
            reason,
          });
        }
      },
    });
  },
};
