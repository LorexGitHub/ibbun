import type { Levels } from "@mojibun/content-graph/levels";
import { rebuildDerivedLinks } from "../sources/derived-links/index.ts";
import { runGrammarSeed, type GrammarSeedDeps } from "../sources/grammar-seed/index.ts";
import { runMatchers, type MatcherRunsDeps } from "../sources/matcher-runs/index.ts";
import type { Refresh } from "./jobs.ts";
import { runImport, type ImportDeps } from "./run.ts";

export type Everything = { imports: ImportDeps; refreshes: Refresh[]; grammarSeed: GrammarSeedDeps; matcherRuns: MatcherRunsDeps; levels: Levels };

/**
 * Every import now, with no schedule in between: each source in list order, which is the order their inputs need
 * (JMdict and KANJIDIC2 lead `refreshes()`), then the one-time grammar seed, then what is computed from all of them.
 * A failure stops the run. Running it again picks up where it stopped, because every step ends in the same state.
 */
export const importEverything = async ({ imports, refreshes, grammarSeed, matcherRuns, levels }: Everything, say: (line: string) => void): Promise<void> => {
  for (const { source } of refreshes) {
    const { upstreamVersion, report } = await runImport(imports, source);
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
