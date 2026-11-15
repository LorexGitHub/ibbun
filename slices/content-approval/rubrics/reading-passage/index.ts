import { checkBatchItemsAppear, checkWithinReach, type Authoring, type Failure, type TextItem } from "@ibbun/content-graph/authoring";
import type { Nlp } from "@ibbun/nlp";
import type { BatchText, Progress, Texts } from "@ibbun/progress";
import { z } from "zod";
import { contextOf, itemLabel, passageUnit, requestOfRun, sentenceLines, textItems, tokenise, type PassageUnit } from "../../src/passages.ts";

/** The batch a Batch Text is for, as content-generation keeps it on the request's reason. */
const BatchContext = z.object({ learnerId: z.string(), level: z.string(), itemIds: z.array(z.string()).min(1) });

/** A drafted Batch Text: its Reading Passage and Sentences, with the Learner's record of the episode. */
export type BatchTextDraft = PassageUnit & {
  kind: "reading-passage";
  learnerId: string;
  /** The batch's JLPT Level, or null for an Unlevelled batch. */
  level: string | null;
  items: TextItem[];
  record: BatchText | undefined;
  /** The episode before this one at the same level, whose summary this one continues. */
  previous: BatchText | undefined;
};

export type BatchTextCheck = { failures: Failure[]; items: string[] };

export const batchTextDrafts = async (a: Authoring, texts: Texts, runId: string): Promise<BatchTextDraft[]> => {
  const request = await requestOfRun(a, runId);
  const context = contextOf("batch-text ", BatchContext, request.reason);
  const unit = context && (await passageUnit(a, request.targetId));
  if (!context || !unit) return [];
  const mine = await texts.batchTexts(context.learnerId as BatchText["learnerId"]);
  const record = mine.find((t) => t.passageId === request.targetId);
  const previous = record && mine.filter((t) => t.level === record.level && t.episode === record.episode - 1).at(-1);
  const level = context.level === "unlevelled" ? null : context.level;
  return [{ kind: "reading-passage", ...unit, learnerId: context.learnerId, level, items: await textItems(a, context.itemIds), record, previous }];
};

/** Stores the tokens, then the Learner-aware checks (batch-text.md#automatic-checks): every batch item appears, everything else is within reach. */
export const checkBatchText = async (a: Authoring, nlp: Nlp, progress: Progress, draft: BatchTextDraft): Promise<BatchTextCheck> => {
  const sentences = await tokenise(a, nlp, draft.lines);
  const known = new Set<string>(await progress.known(draft.learnerId as BatchText["learnerId"]));
  const level = draft.level as Parameters<typeof checkWithinReach>[2];
  const failures = [...checkBatchItemsAppear(sentences, draft.items, level, known), ...checkWithinReach(sentences, draft.items, level, known)];
  return { failures, items: await Promise.all(draft.items.map((item) => itemLabel(a, item))) };
};

/** The values the rubric template needs. */
export const batchTextValues = ({ level, record, previous, lines }: BatchTextDraft, check: BatchTextCheck): Record<string, string> => ({
  level: level ?? "Unlevelled",
  passageType: record?.passageType ?? "not recorded",
  episode: record ? String(record.episode) : "not recorded",
  episodeSummary: previous ? `Cast: ${previous.cast.join("、")}\n${previous.episodeSummary}` : "none: this is the first episode",
  items: check.items.map((name) => `- ${name}`).join("\n") || "none",
  sentences: sentenceLines(lines),
});
