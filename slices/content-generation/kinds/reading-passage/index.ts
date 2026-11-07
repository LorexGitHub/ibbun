import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Authoring, GenerationRequest, GenerationRun } from "@mojibun/content-graph/authoring";
import type { Texts } from "@mojibun/progress";
import { definePlan, type Kind, type Services } from "../kind.ts";
import { subjectOf, type Subject } from "../example-sentence/subject.ts";
import { contextOf, type BatchContext } from "./context.ts";
import { earlierItems, levelProgress, levelsByItem } from "./earlier.ts";
import { earlierItemCount, passageType, targetLength } from "./plan-numbers.ts";

export const TEMPLATE_VERSION = "reading-passage/1";

export const Passage = z.object({
  title: z.string().min(1),
  sentences: z.array(z.object({ text: z.string().min(1), translationEn: z.string().min(1) })).min(1),
  /** The recurring cast and setting, unchanged from the last episode unless the story needs more. */
  cast: z.array(z.string().min(1)).min(1),
  /** The whole story so far, this episode included. */
  episodeSummary: z.string().min(1),
});
type Passage = z.output<typeof Passage>;

const SYSTEM = `You write short Japanese reading passages for JLPT learners, as episodes of a continuing story. Use only vocabulary and grammar at or below the stated JLPT level, apart from the items you are asked to use. Give every sentence an accurate English translation. Answer only in the requested JSON shape.`;

/** The same batch always gets the same passage id, so a redelivered job finds the work it already did. */
export const passageIdOf = ({ learnerId, itemIds }: BatchContext): string => {
  const bytes = createHash("sha256").update(`${learnerId}\n${[...itemIds].sort().join("\n")}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const subjects = async (auth: Authoring, ids: readonly string[]): Promise<Subject[]> =>
  (await Promise.all(ids.map((id) => subjectOf(auth, id)))).filter((s): s is Subject => s !== null);

const factsOf = (items: readonly Subject[]) => items.map((s) => s.facts.join(" / "));

const story = (previous: { cast: string[]; episodeSummary: string } | undefined) =>
  previous
    ? [`Recurring cast and setting: ${previous.cast.join("、")}`, `Story so far: ${previous.episodeSummary}`, "Continue the story with the next episode."]
    : ["This is the first episode: invent a small recurring cast and a setting that suit the level."];

type Attempt = { auth: Authoring; texts: Texts; now: () => Date; request: GenerationRequest; context: BatchContext; episode: number };

const insertDraft = async ({ auth, request }: Attempt, run: GenerationRun, inputs: string[], { title, sentences }: Passage) => {
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
  const passageId = request.targetId;
  // A retry rewrites the same passage; the links of the rejected attempt are retired.
  const [existing] = await auth.rows("readingPassage", { id: passageId });
  if (existing) {
    await auth.update("readingPassage", { id: passageId }, { title, ...life });
    await auth.update("passageContainsSentence", { passageId }, { retired: true });
  } else {
    await auth.insert("readingPassage", [{ id: passageId, title, form: "prose", comprehensionQuestions: [], ...life }]);
  }
  for (const [position, s] of sentences.entries()) {
    const sentenceId = randomUUID();
    await auth.insert("sentence", [
      { id: sentenceId, text: s.text, translationEn: s.translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
    ]);
    await auth.insert("passageContainsSentence", [{ id: randomUUID(), passageId, sentenceId, position, ...life }]);
  }
};

/** The Batch Text record is written once, with the first attempt; retries rewrite only the passage. */
const recordBatchText = async ({ texts, now, request, context, episode }: Attempt, { cast, episodeSummary }: Passage) => {
  const recorded = (await texts.batchTexts(context.learnerId)).some((t) => t.passageId === request.targetId);
  if (recorded) return;
  await texts.record({
    kind: "batch",
    learnerId: context.learnerId,
    passageId: request.targetId,
    at: now().toISOString(),
    level: context.level,
    episode,
    studyItemIds: context.itemIds,
    episodeSummary,
    cast,
  });
};

const plan = async (auth: Authoring, request: GenerationRequest, feedback: string | undefined, { progress, texts, now }: Services) => {
  const context = contextOf(request.reason);
  if (!context) return null;
  const batch = await subjects(auth, context.itemIds);
  if (!batch.length) return null;

  const [past, met, levels] = await Promise.all([texts.batchTexts(context.learnerId), progress.items(context.learnerId), levelsByItem(auth)]);
  const previous = past.filter((t) => t.level === context.level && t.passageId !== request.targetId);
  const episode = previous.length + 1;
  const length = targetLength(context.level, levelProgress(met, levels, context.level));
  const type = passageType(context.level, episode);
  const earlier = await subjects(auth, earlierItems(met, levels, context.level, context.itemIds, earlierItemCount(length)));
  const level = context.level === "unlevelled" ? "N1 (anything the Learner knows or that has a JLPT level)" : context.level;

  const prompt = [
    `Write episode ${episode} as a ${type} of about ${length} characters, at JLPT level ${level} or easier.`,
    ...story(previous.at(-1)),
    "Use every one of these items:",
    ...factsOf(batch),
    ...(earlier.length ? ["Bring back as many of these earlier items as read naturally:", ...factsOf(earlier)] : []),
    ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
  ].join("\n");

  const attempt: Attempt = { auth, texts, now, request, context, episode };
  const used = [...batch, ...earlier];
  return definePlan({
    templateVersion: TEMPLATE_VERSION,
    system: SYSTEM,
    prompt,
    output: Passage,
    inputs: factsOf(used),
    async write(output, run) {
      await insertDraft(attempt, run, used.flatMap((s) => s.recordIds), output);
      await recordBatchText(attempt, output);
    },
  });
};

/** A Batch Text's Reading Passage (batch-text.md#flow), requested by the `batch-text.generate` handler. */
export const readingPassage: Kind = { name: "batch-text", plan };
