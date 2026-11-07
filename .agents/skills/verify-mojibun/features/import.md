# import

The supervisor sees every Import Run at `/admin/import`: dataset, upstream version, status, what the run added, changed and retired, which overrides it left Stale or Orphaned, which Examples it sent back to Draft, which Study Items it Suspended, and a link into the Content Approval queue filtered to the run. Runs start themselves from `worker` schedules: JMdict on the first Monday of each month (retried daily until it lands) from jmdict-simplified, Tatoeba on Saturday and Sunday noon UTC after the Saturday 06:30 export, and a daily staleness check that queues a `staleness alarm` when live JMdict or KANJIDIC2 data is older than 31 days. Nobody starts them.

## Sub-features

- **Import Run** (`slices/import/server/run.ts`): stage (fetch and parse), diff against the latest snapshot, apply through `content-graph/authoring.applySnapshot()`, report. A rerun of an applied or breaker-held version changes nothing and downloads nothing.
- **Snapshot and raw files**: the latest normalised snapshot per dataset in Postgres (`import.snapshot`, `import.snapshot_record`); the raw files of the last 3 runs per dataset under `IMPORT_RAW_DIR` (default `./data/import-raw`). A held run is released by replaying from those files.
- **Scheduled jobs**: `import.jmdict` (daily 12:00 UTC, runs only when the monthly refresh is due), `import.tatoeba` (Sat and Sun 12:00 UTC; an already applied export is a no-op) and `import.staleness` (daily 07:00 UTC), started by `apps/worker`.
- **Report screen** (`GET /api/import/runs`, supervisor only; screen at `/admin/import`).
- **Sources** live in `slices/import/sources/<source>/`. Built: JMdict, Tatoeba (`sources/tatoeba`: per-language `jpn`/`eng` exports, `jpn_indices.csv`, bzip2 via `seek-bzip`; tokens from the Sudachi sidecar `SUDACHI_URL`, so it must be running). KANJIDIC2, KanjiVG and the rest are separate Seed issues.
- **Apply rules** (core, built): `applySnapshot` for `jmdict`, `kanjidic` and `tatoeba`. Its proof is `npx vitest run core/content-graph/src/authoring/snapshot`.

## How to get to it (user POV)

1. Log in as the supervisor.
2. Open **Import** in the nav, or go to `/admin/import`.
3. Read the newest run. Held runs (circuit breaker) are listed first. Follow **Open in the Content Approval queue** to the run's flagged items.

## Driving it with Playwright

Preconditions: baseline from the README, plus `verify.sh` must also start `pnpm --filter @mojibun/worker start` (it does not yet) and the API needs `AUTH_SECRET` and `APP_URL` set so the report API mounts. A supervisor must exist (`pnpm --filter @mojibun/learner grant-supervisor`, after sign-up in the account slice). JMdict is about 11 MB from GitHub, so the first run needs internet and takes a few minutes.

- **Report is supervisor-only**: `curl -s -o /dev/null -w '%{http_code}' $WEB/api/import/runs` with no cookie. Expect `401`. With a plain Learner's cookie, expect `403`.
- **Empty state**: as the supervisor, open `/admin/import` before any run. Expect the heading "Import Runs" and "No Import Run yet".
- **Run starts by itself**: with the worker running, wait for the next `import.jmdict` firing, or enqueue it once: `psql "$DATABASE_URL" -c "select * from jobs.job where name='import.jmdict'"`. Expect one run to reach status `applied`; `/admin/import` shows "jmdict <release tag>" with a non-zero **added** and a link to `/admin/content-approval?importRun=<id>`.
- **Idempotent rerun**: fire the job again. Expect no new row in `content_graph.import_run` and no new download in the worker log.
- **Staleness alarm**: `psql "$DATABASE_URL" -c "update content_graph.import_run set applied_at = now() - interval '40 days' where dataset='jmdict'"`, fire `import.staleness`. Expect one unresolved `content_graph.queue_entry` with reason `staleness alarm` and `detail.dataset = 'jmdict'`.
- **Second view of the stored value** for every journey: `psql "$DATABASE_URL" -c "select dataset, upstream_version, status, counts from content_graph.import_run order by applied_at desc nulls first"`.

## Tatoeba

- **Proof without the network**: `npx vitest run slices/import/sources/tatoeba core/content-graph/src/authoring/snapshot slices/import/server/run.test.ts`.
- **Live run**: needs `SUDACHI_URL` up, JMdict applied first (links resolve against Words), and about 100 MB of downloads. Fire `import.tatoeba`. Expect an `applied` run; `select approval, count(*) from content_graph.sentence group by 1` shows only `draft`; `select count(*) from content_graph.sentence_uses_word` is non-zero; a sentence's provenance row carries the Tatoeba username and `https://tatoeba.org/sentences/show/<id>`.
- **Translation rule**: for a Sentence with several English translations the lowest id owned by a native English speaker (skill level 5 in `eng_user_languages`) is stored, else the lowest id.
- **Links**: `jpn_indices` links win for a Sentence it covers; Sudachi lemma links only for the rest. Not run end to end against the live export by the author (unit tests use fixtures).

## Gotchas


- The `import` Postgres schema holds the slice's private tables. `import` is not a reserved word, but quote it in ad-hoc SQL if a client complains.
- A run held by the circuit breaker applies nothing and leaves only an `import_run` row (`breaker tripped`) and one `breaker tripped` queue entry. Releasing it is a rerun with `{ "release": true }`, which uses the kept raw files.
- jmdict-simplified publishes only a `common` flag, so Word `priorityTags` is `["common"]` or `[]`. Pitch accent is `null` until the UniDic seed.
- The Content Approval queue screen is another slice. Until it ships, the link from the report goes to a route the shell answers with its home fallback.
- Not run end to end against the Compose stack by the author: no supervisor login exists until the account slice ships. The unit and Postgres tests cover the run, the schedule logic, the API roles and the screen.
