// `pnpm content:import`: every import, once, in order. Needs DATABASE_URL and a running Sudachi (SUDACHI_URL).
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { createLevels } from "@mojibun/content-graph/levels";
import { createDb } from "@mojibun/db";
import { connectGrammarSeed } from "../sources/grammar-seed/connect.ts";
import { connectMatcherRuns } from "../sources/matcher-runs/connect.ts";
import { importEverything } from "./import-all.ts";
import { DEFAULT_RAW_DIR } from "./import-server.ts";
import { refreshes } from "./jobs.ts";
import { directoryRawFiles } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 4 });
try {
  await importEverything(
    {
      imports: { authoring: createAuthoring(db), snapshots: postgresSnapshots(db), raw: directoryRawFiles(process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR) },
      refreshes: refreshes(),
      grammarSeed: connectGrammarSeed(db, process.env),
      matcherRuns: connectMatcherRuns(db, process.env),
      levels: createLevels(db),
    },
    (line) => console.log(line),
  );
} finally {
  await db.$client.end();
}
// The grammar seed and the matchers open a job queue on first use, and its connection would keep a finished import from exiting.
process.exit(0);
