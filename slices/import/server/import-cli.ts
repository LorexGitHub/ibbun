// `pnpm content:import`: every import, once, in order. Needs DATABASE_URL and a running Sudachi (SUDACHI_URL).
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { createLevels } from "@ibbun/content-graph/levels";
import { createDb } from "@ibbun/db";
import { connectGrammarSeed } from "../sources/grammar-seed/connect.ts";
import { connectMatcherRuns } from "../sources/matcher-runs/connect.ts";
import { importEverything } from "./import-all.ts";
import { DEFAULT_RAW_DIR } from "./import-server.ts";
import { refreshes } from "./jobs.ts";
import { rawFilesAt } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 4 });
// Each line ends its step, so the time since the previous line is how long that step took (#258 picks each source's home by it).
let last = performance.now();
const say = (line: string) => {
  const now = performance.now();
  console.log(`${line} (${((now - last) / 1000).toFixed(1)} s)`);
  last = now;
};
try {
  await importEverything(
    {
      imports: { authoring: createAuthoring(db), snapshots: postgresSnapshots(db), raw: rawFilesAt(process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR) },
      refreshes: refreshes(),
      grammarSeed: connectGrammarSeed(db, process.env),
      matcherRuns: connectMatcherRuns(db, process.env),
      levels: createLevels(db),
    },
    say,
  );
} finally {
  await db.$client.end();
}
// The grammar seed and the matchers open a job queue on first use, and its connection would keep a finished import from exiting.
process.exit(0);
