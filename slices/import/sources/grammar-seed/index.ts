import { z } from "zod";
import type { Authoring } from "@mojibun/content-graph/authoring";
import { ContentGenerate } from "@mojibun/content-graph/jobs";
import { defineJob, handler, type JobHandler, type Jobs } from "@mojibun/jobs";
import type { Nlp } from "@mojibun/nlp";
import { downloadGrammarSources, type GrammarSources } from "./download.ts";
import { seedGrammar, type SeedExample, type SeedPoint } from "./seed.ts";
import { mapLimited } from "../tatoeba/tokens.ts";
import { withOffsets } from "./tokens.ts";

export type GrammarSeedDeps = {
  nlp: Nlp;
  jobs: Pick<Jobs, "enqueue">;
  /** Reads and writes outside the seed's transaction: the merge proposal requests. */
  authoring: Authoring;
  /** Runs `work` on an Authoring inside one transaction. */
  transact: <T>(work: (authoring: Authoring) => Promise<T>) => Promise<T>;
  download?: () => Promise<GrammarSources>;
};

/** Started by a person, once. It has no schedule: hanabira is not refreshed (ADR 0006). */
export const GrammarSeed = defineJob("import.grammar-seed", z.object({}));

/** How many points are at the Sudachi sidecar at once. Every example of every point at once is more than it accepts. */
const TOKENIZE_CONCURRENCY = 16;

const tokenized = async (nlp: Nlp, text: string, translationEn: string): Promise<SeedExample> => ({ text, translationEn, tokens: withOffsets(await nlp.tokenize(text)) });

const hanabiraPoint = async (nlp: Nlp, point: GrammarSources["hanabira"][number]): Promise<SeedPoint> => ({
  ...point,
  examples: await mapLimited(point.examples, 1, (e) => tokenized(nlp, e.text, e.translationEn)),
});

const tanosPoint = ({ key, level, title }: GrammarSources["tanos"][number]): SeedPoint => ({ key, level, title, meaning: "", notes: null, formation: [], examples: [] });

/** Asks the merge proposal kind which Tanos entry each hanabira point matches; each answer lands in the Content Approval queue. */
const proposeMerges = async ({ authoring, jobs }: GrammarSeedDeps, hanabiraIds: string[]) => {
  for (const targetId of hanabiraIds) {
    const request = await authoring.requestGeneration({ targetId, kind: "merge_proposal", reason: "grammar seed" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
  }
};

/** Downloads, parses, seeds and asks for merge proposals. Returns false when the seed already ran. */
export const runGrammarSeed = async (deps: GrammarSeedDeps): Promise<boolean> => {
  const sources = await (deps.download ?? downloadGrammarSources)();
  const hanabira = await mapLimited(sources.hanabira, TOKENIZE_CONCURRENCY, (point) => hanabiraPoint(deps.nlp, point));
  const tanos = sources.tanos.map(tanosPoint);
  const ids = await deps.transact((authoring) =>
    seedGrammar(authoring, { hanabira: { version: sources.hanabiraCommit, points: hanabira }, tanos: { version: sources.tanosSnapshot, points: tanos } }),
  );
  if (!ids) return false;
  await proposeMerges(deps, ids);
  return true;
};

export const grammarSeedJob = (deps: () => GrammarSeedDeps): JobHandler => handler(GrammarSeed, async () => void (await runGrammarSeed(deps())));
