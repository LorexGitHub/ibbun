import { FIXTURE_PROVENANCE_ID } from "@ibbun/content-graph/authoring";
import type { Levels } from "@ibbun/content-graph/levels";
import { rebuildDerivedLinks } from "../sources/derived-links/index.ts";
import { runGrammarSeed, type GrammarSeedDeps } from "../sources/grammar-seed/index.ts";
import { runMatchers, type MatcherRunsDeps } from "../sources/matcher-runs/index.ts";
import type { Refresh } from "./jobs.ts";
import { runImport, type ImportDeps } from "./run.ts";

export type Everything = { imports: ImportDeps; refreshes: Refresh[]; grammarSeed: GrammarSeedDeps; matcherRuns: MatcherRunsDeps; levels: Levels };

/**
 * A dataset's first import has no content to protect, and it sets thousands of levels at once, so a circuit breaker
 * that holds it is released on the spot. Every later import stays with the breaker and the supervisor.
 */
const firstOrLater = async (imports: ImportDeps, source: Refresh["source"], say: (line: string) => void) => {
  const first = (await imports.authoring.rows("importRun", { dataset: source.dataset, status: "applied" })).length === 0;
  const outcome = await runImport(imports, source);
  if (!first || outcome.report.status !== "breaker tripped") return outcome;
  say(`${source.dataset}: first import, released from the circuit breaker`);
  return runImport(imports, source, { release: true });
};

/**
 * Every import now, with no schedule in between: each source in list order, which is the order their inputs need
 * (JMdict and KANJIDIC2 lead `refreshes()`), then the one-time grammar seed, then what is computed from all of them.
 * A failure stops the run. Running it again picks up where it stopped, because every step ends in the same state.
 */
export const importEverything = async ({ imports, refreshes, grammarSeed, matcherRuns, levels }: Everything, say: (line: string) => void): Promise<void> => {
  // The fixture's Kanji and Words are the real ones under other ids, so the two cannot share a database.
  if ((await imports.authoring.rows("provenance", { id: FIXTURE_PROVENANCE_ID })).length) {
    throw new Error("this database holds the N5 fixture; the real content needs a database without it (see the README)");
  }
  for (const { source } of refreshes) {
    const { upstreamVersion, report } = await firstOrLater(imports, source, say);
    const { added, changed, retired } = report.counts;
    say(`${source.dataset} ${upstreamVersion}: ${report.status}, ${added} added, ${changed} changed, ${retired} retired`);
    for (const reason of report.tripped) say(`${source.dataset}: held by the circuit breaker, ${reason}`);
  }
  say(`grammar seed: ${(await runGrammarSeed(grammarSeed)) ? "seeded" : "already seeded"}`);
  const links = await rebuildDerivedLinks(imports);
  say(`derived links: ${links.added} added, ${links.removed} removed`);
  const rebuilt = await levels.rebuild();
  say(`levels: ${rebuilt.changedLevels} changed, ${rebuilt.derivedAdded} derived`);
  const matched = await runMatchers(matcherRuns);
  say(`matchers: ${matched.proposed} links proposed, ${matched.requested} Generation Requests opened`);
};
