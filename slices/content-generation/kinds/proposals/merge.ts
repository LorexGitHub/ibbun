import { z } from "zod";
import type { Authoring } from "@ibbun/content-graph/authoring";
import { definePlan, type Kind } from "../kind.ts";
import { CONFIDENCE, enqueueProposal } from "./queue.ts";

export const MERGE_TEMPLATE_VERSION = "merge-proposal/1";

const SYSTEM = `You match Japanese grammar patterns from two lists. Two entries are a match only when they teach the same pattern with the same meaning; a shared spelling with an unrelated meaning is not a match (ように "so that" and ように "like" are different points). When no candidate fits, answer null. Answer only in the requested JSON shape.`;

type Facts = { id: string; text: string };

/** Grammar Points imported from `dataset`, as the prompt lists them. */
const importedFrom = async (auth: Authoring, dataset: string): Promise<Facts[]> => {
  const keys = await auth.rows("sourceKey", { dataset });
  const found = await Promise.all(
    keys.map(async ({ recordId }) => {
      const [point] = await auth.rows("grammarPoint", { studyItemId: recordId });
      if (!point) return [];
      const levels = (await auth.rows("levelCandidate", { studyItemId: recordId })).map((l) => l.level);
      const forms = point.forms.map((f) => f.text).join("、");
      return [{ id: recordId, text: `${point.title} (forms: ${forms}) — ${point.meaning}${levels.length ? ` [${levels.join(", ")}]` : ""}` }];
    }),
  );
  return found.flat();
};

/** Which Tanos entry a hanabira Grammar Point matches (grammar-points.md#inventory). */
export const mergeProposal: Kind = {
  name: "merge_proposal",
  async plan(auth, request, feedback) {
    const hanabira = (await importedFrom(auth, "hanabira")).find((p) => p.id === request.targetId);
    if (!hanabira) return null;
    const candidates = await importedFrom(auth, "tanos");
    if (!candidates.length) return null;
    const lines = candidates.map((c, i) => `${i + 1}. ${c.text}`);
    return definePlan({
      templateVersion: MERGE_TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `hanabira point: ${hanabira.text}`,
        "Tanos entries:",
        ...lines,
        "Which Tanos entry is the same Grammar Point? Give its number, or null if none is.",
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: z.object({
        match: z.number().int().min(1).max(candidates.length).nullable(),
        confidence: z.enum(CONFIDENCE),
        reason: z.string().min(1),
      }),
      inputs: [hanabira.text, ...lines],
      write: async ({ match, confidence, reason }, run) => {
        await enqueueProposal(auth, run, "merge proposal", request.targetId, {
          hanabiraId: request.targetId,
          tanosId: match === null ? null : candidates[match - 1]!.id,
          confidence,
          reason,
        });
      },
    });
  },
};
