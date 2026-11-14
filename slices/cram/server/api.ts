import { Hono, type Context } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@ibbun/auth";
import type { ContentGraph, Example, StudyItem, StudyItemSummary } from "@ibbun/content-graph";
import { grade, normalise, normaliseMeaning, type AnswerData } from "@ibbun/content-graph/grade";
import type { Progress } from "@ibbun/progress";
import { StudyItemId, type LearnerId } from "@ibbun/shared";
import { CramType, ItemQuery, Submission, type CramItem, type FacetName, type FacetOutcome, type SubmissionData, type Verdict } from "../contract.ts";
import { answerDataFor, questionFor } from "./question.ts";

export type CramDeps = { contentGraph: ContentGraph; progress: Progress; sessions: SessionResolver; now: () => Date };

const bad = (c: Context, message: string) => c.json({ message }, 400);
const missing = (c: Context, message: string) => c.json({ message }, 404);

const normaliseFor = (facet: FacetName, input: string) => (facet === "meaning" ? normaliseMeaning(input) : normalise(input));

/** Show answer: every facet fails, whatever was typed. */
const allFail = (facets: SubmissionData["facets"]): FacetOutcome[] => facets.map(({ facet }) => ({ facet, outcome: "fail" }));

const graded = (data: Map<FacetName, AnswerData>, facets: SubmissionData["facets"]): FacetOutcome[] =>
  facets.map(({ facet, input }) => ({ facet, ...grade(data.get(facet)!, input as never) }));

/** Whether the submission answers exactly the facets the Example asks, once each. */
const asksSameFacets = (data: Map<FacetName, AnswerData>, facets: SubmissionData["facets"]) =>
  facets.length === data.size && new Set(facets.map((f) => f.facet)).size === data.size && facets.every((f) => data.has(f.facet));

const review = (parsed: SubmissionData, results: FacetOutcome[], learnerId: LearnerId, at: Date) => ({
    learnerId,
    studyItemId: parsed.studyItemId,
    kind: "cram" as const,
    passed: results.every((r) => r.outcome === "pass"),
    at: at.toISOString(),
    exampleId: parsed.exampleId,
    facets: results.map((r, i) => ({
      facet: r.facet,
      rawInput: parsed.facets[i]!.input,
      normalisedInput: normaliseFor(r.facet, parsed.facets[i]!.input),
      outcome: r.outcome === "pass" ? ("pass" as const) : ("fail" as const),
      ...(r.matchedAnswerId ? { matchedAnswerId: r.matchedAnswerId } : {}),
    })),
    attempts: parsed.attempts,
    hintsOpened: parsed.hintsOpened,
    revealed: parsed.revealed,
    ...(parsed.timeToAnswerMs === undefined ? {} : { timeToAnswerMs: parsed.timeToAnswerMs }),
});

/** Study Items of the types Cram practises, chosen by a search or by level. Locked ones are included. */
const summariesFor = (contentGraph: ContentGraph, { q, level, type }: ItemQuery): Promise<StudyItemSummary[]> => {
  if (q) return contentGraph.search(q).then((found) => found.filter((i) => !type || i.type === type));
  const types = type ? [type] : CramType.options;
  return Promise.all(types.map((t) => contentGraph.levelList(level!, t))).then((lists) => lists.flat());
};

/** The list with the Learner's Mastery on each item, narrowed to one Mastery when the query names it. */
const itemsFor = async ({ contentGraph, progress }: CramDeps, learnerId: LearnerId, query: ItemQuery): Promise<CramItem[]> => {
  const [found, met] = await Promise.all([summariesFor(contentGraph, query), progress.items(learnerId)]);
  const mastery = new Map(met.map((p) => [p.studyItemId, p.mastery]));
  const items = found.map((item) => ({ ...item, mastery: mastery.get(item.id) ?? ("new" as const) }));
  return query.mastery ? items.filter((item) => item.mastery === query.mastery) : items;
};

const exampleOf = (examples: Example[], id: string) => examples.find((e) => e.id === id);

/**
 * Cram: choose Study Items, locked or not, and practise them. Answers are graded by the same
 * `grade()` the web client runs, then logged as `cram` Reviews, which never feed the Scheduler or Mastery.
 */
export const createCramApi = (deps: CramDeps) => {
  const { requireLearner } = createAuthGuards(deps.sessions);
  const { contentGraph, progress, now } = deps;

  return new Hono<AuthEnv>()
    .use(requireLearner())
    .get("/items", async (c) => {
      const query = ItemQuery.safeParse(c.req.query());
      return query.success ? c.json(await itemsFor(deps, c.get("learner").learnerId, query.data)) : bad(c, query.error.message);
    })
    .get("/items/:id/question", async (c) => {
      const id = StudyItemId.safeParse(c.req.param("id"));
      if (!id.success) return bad(c, "not a Study Item id");
      const page = await contentGraph.studyItem(id.data);
      const question = page && questionFor(page, c.req.query("after"));
      return question ? c.json(question) : missing(c, "nothing to practise");
    })
    .post("/answers", async (c) => {
      const body = Submission.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return bad(c, body.error.message);
      const submission = body.data;
      const page = await contentGraph.studyItem(submission.studyItemId);
      const example = page && exampleOf(page.examples, submission.exampleId);
      if (!page || !example) return missing(c, "no such Example for that Study Item");
      const data = answerDataFor(page.item as StudyItem, example);
      if (!asksSameFacets(data, submission.facets)) return bad(c, "the facets are not the ones this Example asks");
      const results = submission.revealed ? allFail(submission.facets) : graded(data, submission.facets);
      if (results.some((r) => r.outcome === "retry")) return c.json({ status: "retry", results } satisfies Verdict);
      const logged = review(submission, results, c.get("learner").learnerId, now());
      await progress.record(logged);
      return c.json({ status: "graded", passed: logged.passed, results } satisfies Verdict);
    });
};
