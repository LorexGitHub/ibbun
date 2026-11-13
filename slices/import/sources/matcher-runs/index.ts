import { randomUUID } from "node:crypto";
import { z } from "zod";
import { matchRule, type Authoring, type MatcherRule, type Row } from "@ibbun/content-graph/authoring";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { defineJob, handler, type JobHandler, type Jobs } from "@ibbun/jobs";

export type MatcherRunsDeps = { authoring: Authoring; jobs: Pick<Jobs, "enqueue"> };
export type MatcherRunsReport = { proposed: number; requested: number };

/** 5 approved Examples per Grammar Point, as a config value (grammar-points.md#sentence-demonstrates-grammar-point). */
export const EXAMPLES_PER_GRAMMAR_POINT = 5;

const PROCESS = { name: "matcher-run", version: "1" } as const;

/** Started by a person, or by the worker after Grammar Points are approved. */
export const MatcherRuns = defineJob("import.matcher-runs", z.object({}));

const live = { approval: "approved", retired: false } as const;
const spanKey = (sentenceId: string, grammarPointId: string, start: number, end: number) => `${sentenceId}\0${grammarPointId}\0${start}\0${end}`;

/** The one Provenance row for this process version, made on first use. */
const provenanceFor = async (authoring: Authoring) => {
  const found = (await authoring.rows("provenance")).find(({ source }) => source.kind === "derived" && source.process === PROCESS.name && source.version === PROCESS.version);
  if (found) return found.id;
  const id = randomUUID();
  await authoring.insert("provenance", [{ id, source: { kind: "derived", process: PROCESS.name, version: PROCESS.version }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
  return id;
};

/** Approved Grammar Points that have a Matcher Rule. */
const rulesToRun = async (authoring: Authoring) => {
  const approved = new Set((await authoring.rows("studyItem", { type: "grammar_point", ...live })).map((i) => i.id));
  return (await authoring.rows("grammarPoint")).flatMap((p) => (approved.has(p.studyItemId) && p.matcherRule ? [{ id: p.studyItemId, rule: p.matcherRule as MatcherRule }] : []));
};

/** Draft links for every match no decision or earlier proposal covers, whatever the link's state now. */
const proposeLinks = async (authoring: Authoring): Promise<number> => {
  const [rules, sentences, existing] = await Promise.all([rulesToRun(authoring), authoring.rows("sentence", live), authoring.rows("sentenceDemonstratesGrammar")]);
  const known = new Set(existing.map((l) => spanKey(l.sentenceId, l.grammarPointId, l.spanStart, l.spanEnd)));
  const provenanceId = await provenanceFor(authoring);
  const drafts: Row<"sentenceDemonstratesGrammar">[] = rules.flatMap(({ id: grammarPointId, rule }) =>
    sentences.flatMap((s) =>
      matchRule(rule, s.tokens)
        .filter(({ start, end }) => !known.has(spanKey(s.id, grammarPointId, start, end)))
        .map(({ start, end }) => ({ id: randomUUID(), sentenceId: s.id, grammarPointId, spanStart: start, spanEnd: end, approval: "draft" as const, retired: false, provenanceId })),
    ),
  );
  if (drafts.length) await authoring.insert("sentenceDemonstratesGrammar", drafts);
  return drafts.length;
};

/** Asks Content Generation for more Examples where a Grammar Point has too few, once per Grammar Point until the request ends. */
const requestTopUps = async ({ authoring, jobs }: MatcherRunsDeps): Promise<number> => {
  const approved = await authoring.rows("example", live);
  const have = (id: string) => approved.filter((e) => e.studyItemId === id).length;
  const open = new Set((await authoring.rows("generationRequest", { kind: "examples" })).filter((r) => r.status === "open" || r.status === "in review").map((r) => r.targetId));
  const short = (await rulesToRun(authoring)).filter(({ id }) => have(id) < EXAMPLES_PER_GRAMMAR_POINT && !open.has(id));
  for (const { id } of short) {
    const request = await authoring.requestGeneration({ targetId: id, kind: "examples", reason: "matcher run" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
  }
  return short.length;
};

/**
 * Runs every approved Matcher Rule over every approved Sentence and proposes the matches as `draft` demonstrates
 * links (grammar-points.md#matcher-rule). A link keyed by (Sentence, Grammar Point, span) is never proposed twice,
 * so decisions stay and a rerun ends in the same state. Grammar Points still short of Examples open a Generation Request.
 */
export const runMatchers = async (deps: MatcherRunsDeps): Promise<MatcherRunsReport> => {
  const proposed = await proposeLinks(deps.authoring);
  return { proposed, requested: await requestTopUps(deps) };
};

export const matcherRunsJob = (deps: () => MatcherRunsDeps): JobHandler => handler(MatcherRuns, async () => void (await runMatchers(deps())));
