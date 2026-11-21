import type { Authoring } from "@ibbun/content-graph/authoring";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { currentLevel } from "@ibbun/content-graph/levels";
import type { Jobs } from "@ibbun/jobs";
import { JlptLevel, LearnerId, StudyItemId } from "@ibbun/shared";
import { requestDialogues } from "../kinds/dialogue/index.ts";
import { passageIdOf } from "../kinds/reading-passage/index.ts";
import { contextOf, reasonOf, type BatchContext } from "../kinds/reading-passage/context.ts";

type Deps = { auth: Authoring; jobs: Jobs };
type Options = { level: JlptLevel; learnerId?: LearnerId; points?: number; clips?: number; texts?: number };
type Scope = { level: JlptLevel; points: number };
type Stage = { kind: string; reason: string; targets: (auth: Authoring, scope: Scope) => Promise<string[]> };

const BATCH_SIZE = 10;
const live = { retired: false } as const;
const notRejected = (rows: { approval: string }[]) => rows.some((r) => r.approval !== "rejected");

/** A seeded Grammar Point's List candidate is a Draft with it, so the level here counts every candidate not rejected. */
const levelOf = async (auth: Authoring, studyItemId: string) =>
  currentLevel((await auth.rows("levelCandidate", { studyItemId, ...live })).filter((c) => c.approval !== "rejected").map((c) => ({ ...c, approval: "approved" })));

/** The first `points` Grammar Points at the level by id, Draft or approved, so every run and every stage works on the same set. */
const pointsAt = async (auth: Authoring, { level, points }: Scope, approval: "draft" | "approved") => {
  const all: { id: string; approval: string }[] = [];
  for (const state of ["draft", "approved"] as const)
    for (const { id } of await auth.rows("studyItem", { type: "grammar_point", approval: state, ...live })) if ((await levelOf(auth, id)) === level) all.push({ id, approval: state });
  return all.sort((a, b) => a.id.localeCompare(b.id)).slice(0, points).filter((p) => p.approval === approval).map((p) => p.id);
};

const without = async (ids: string[], has: (id: string) => Promise<boolean>) => {
  const kept: string[] = [];
  for (const id of ids) if (!(await has(id))) kept.push(id);
  return kept;
};

/** The stages that need only the seed; the examples and explanation kinds generate only for an approved Grammar Point. */
const STAGES: Stage[] = [
  { kind: "grammar-fields", reason: "seeded grammar point", targets: (auth, scope) => pointsAt(auth, scope, "draft") },
  {
    kind: "examples",
    reason: "grammar point without examples",
    targets: async (auth, scope) =>
      without(await pointsAt(auth, scope, "approved"), async (studyItemId) => notRejected(await auth.rows("example", { studyItemId, ...live }))),
  },
  {
    kind: "explanation",
    reason: "grammar point without an explanation",
    targets: async (auth, scope) =>
      without(await pointsAt(auth, scope, "approved"), async (grammarPointId) => notRejected(await auth.rows("japaneseExplanation", { grammarPointId, ...live }))),
  },
];

const openMissing = async ({ auth, jobs }: Deps, { kind, reason, targets }: Stage, scope: Scope) => {
  const asked = new Set((await auth.rows("generationRequest", { kind })).map((r) => r.targetId));
  let opened = 0;
  for (const targetId of await targets(auth, scope)) {
    if (asked.has(targetId)) continue;
    const request = await auth.requestGeneration({ targetId, kind, reason });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
    opened++;
  }
  return opened;
};

/** Approved Words at the level, by id, cut into batches of ten, so every run proposes the same batches. */
const batchesAt = async (auth: Authoring, learnerId: LearnerId, level: JlptLevel): Promise<BatchContext[]> => {
  const words = await auth.rows("studyItem", { type: "word", approval: "approved", ...live });
  const ids: string[] = [];
  for (const { id } of words) if (currentLevel(await auth.rows("levelCandidate", { studyItemId: id })) === level) ids.push(id);
  ids.sort();
  const batches: BatchContext[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push({ learnerId, level, itemIds: ids.slice(i, i + BATCH_SIZE).map((id) => StudyItemId.parse(id)) });
  return batches;
};

/**
 * Opens the Batch Text requests itself, as `batch-text.generate` would, so a rerun before the worker has run sees them.
 * `cap` counts every Batch Text request the Learner has at the level, the ones `learn` opened included.
 */
const requestBatchTexts = async ({ auth, jobs }: Deps, learnerId: LearnerId, level: JlptLevel, cap: number) => {
  const requests = await auth.rows("generationRequest", { kind: "batch-text" });
  const asked = new Set(requests.map((r) => r.targetId));
  let room = cap - requests.map((r) => contextOf(r.reason)).filter((c) => c?.learnerId === learnerId && c.level === level).length;
  let opened = 0;
  for (const context of await batchesAt(auth, learnerId, level)) {
    if (room <= 0) break;
    const targetId = passageIdOf(context);
    if (asked.has(targetId)) continue;
    const request = await auth.requestGeneration({ targetId, kind: "batch-text", reason: reasonOf(context) });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
    opened++;
    room--;
  }
  return opened;
};

/**
 * Opens every Generation Request one JLPT level still lacks and starts each. Rerun it after each review round:
 * a stage finds targets only once the stage before it has been approved. Returns how many it opened, by kind.
 */
export const requestLevel = async (deps: Deps, { level, learnerId, points = Infinity, clips = 10, texts = 10 }: Options): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const stage of STAGES) counts[stage.kind] = await openMissing(deps, stage, { level, points });
  counts.dialogue = await requestDialogues(deps.auth, deps.jobs, { level, cap: clips });
  counts["batch-text"] = learnerId ? await requestBatchTexts(deps, learnerId, level, texts) : 0;
  return counts;
};

const count = (value: string | undefined) => (value === undefined ? undefined : Number.parseInt(value, 10));

/** The command line's `--level`, `--learner`, `--points`, `--clips` and `--texts`, parsed. */
export const optionsOf = (values: { level?: string; learner?: string; points?: string; clips?: string; texts?: string }): Options => ({
  level: JlptLevel.parse(values.level),
  learnerId: values.learner === undefined ? undefined : LearnerId.parse(values.learner),
  points: count(values.points),
  clips: count(values.clips),
  texts: count(values.texts),
});
