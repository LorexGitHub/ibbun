# import

The supervisor sees every Import Run at `/admin/import`: dataset, upstream version, status, what the run added, changed and retired, which overrides it left Stale or Orphaned, which Examples it sent back to Draft, which Study Items it Suspended, and a link into the Content Approval queue filtered to the run. Runs start themselves from `worker` schedules: JMdict and KANJIDIC2 (with KRADFILE) on the first Monday of each month (retried daily until it lands) from jmdict-simplified, and a daily staleness check that queues a `staleness alarm` when live JMdict or KANJIDIC2 data is older than 31 days. Nobody starts them.

## Sub-features

- **Import Run** (`slices/import/server/run.ts`): stage (fetch and parse), diff against the latest snapshot, apply through `content-graph/authoring.applySnapshot()`, report. A rerun of an applied or breaker-held version changes nothing and downloads nothing.
- **Snapshot and raw files**: the latest normalised snapshot per dataset in Postgres (`import.snapshot`, `import.snapshot_record`); the raw files of the last 3 runs per dataset under `IMPORT_RAW_DIR` (default `./data/import-raw`). A held run is released by replaying from those files.
- **Scheduled jobs**: `import.jmdict` and `import.kanjidic` (each daily 12:00 UTC, runs only when the monthly refresh is due), `import.wiktionary-ja` (Mondays 12:00 UTC; a no-op until kaikki.org shows a new extraction date) and `import.staleness` (daily 07:00 UTC), started by `apps/worker`.
- **Report screen** (`GET /api/import/runs`, supervisor only; screen at `/admin/import`).
- **Sources** live in `slices/import/sources/<source>/`. Built: JMdict, KANJIDIC2 + KRADFILE (`kanjidic2-all` and `kradfile` files of the same jmdict-simplified release; every character, English meanings only, `strokes` empty until the KanjiVG seed). ja Wiktionary (`sources/ja-wiktionary`: the kaikki.org wiktextract dump of the Japanese edition, one record per Japanese gloss keyed `title#entry.gloss`; version is the extraction date; redirect stubs, cross-reference glosses and other languages are skipped). KanjiVG, Tatoeba and the rest are separate Seed issues.
- **Apply rules** (core, built): `applySnapshot` for `jmdict`, `kanjidic`, `tatoeba` and `wiktionary-ja`. A ja Wiktionary gloss becomes a Draft Japanese Explanation (CC BY-SA 4.0, Provenance link to `https://ja.wiktionary.org/wiki/<title>`) on the first sense of the one JLPT Word (it has a Level Candidate) whose kanji form, or kana reading if it has no kanji form, equals the page title. A page that fits no Word or several Words is skipped and offered again next run. The first gloss for a Word opens a `sense_alignment` Generation Request; the proposals it makes go to the Content Approval queue as `sense alignment`. Its proof is `npx vitest run core/content-graph/src/authoring/snapshot`.

## How to get to it (user POV)

1. Log in as the supervisor.
2. Open **Import** in the nav, or go to `/admin/import`.
3. Read the newest run. Held runs (circuit breaker) are listed first. Follow **Open in the Content Approval queue** to the run's flagged items.

## Driving it with Playwright

Preconditions: baseline from the README, plus `verify.sh` must also start `pnpm --filter @mojibun/worker start` (it does not yet) and the API needs `AUTH_SECRET` and `APP_URL` set so the report API mounts. A supervisor must exist (`pnpm --filter @mojibun/learner grant-supervisor`, after sign-up in the account slice). JMdict is about 11 MB from GitHub, so the first run needs internet and takes a few minutes.

- **Report is supervisor-only**: `curl -s -o /dev/null -w '%{http_code}' $WEB/api/import/runs` with no cookie. Expect `401`. With a plain Learner's cookie, expect `403`.
- **Empty state**: as the supervisor, open `/admin/import` before any run. Expect the heading "Import Runs" and "No Import Run yet".
- **Run starts by itself**: with the worker running, wait for the next `import.jmdict` firing, or enqueue it once: `psql "$DATABASE_URL" -c "select * from jobs.job where name='import.jmdict'"`. Expect one run to reach status `applied`; `/admin/import` shows "jmdict <release tag>" with a non-zero **added** and a link to `/admin/content-approval?importRun=<id>`.
- **KANJIDIC2 run**: enqueue `import.kanjidic` the same way. Expect one `applied` run for dataset `kanjidic` with about 13,100 added; `psql "$DATABASE_URL" -c "select literal, meanings, on_readings, kun_readings, grade, frequency, components from content_graph.kanji where literal = '食'"` shows eat/food, ショク, grade 2, frequency 328. 12,156 Kanji have components (KRADFILE has none for the rest).
- **ja Wiktionary run**: needs JMdict and the JLPT level seed applied first. Enqueue `import.wiktionary-ja`. Expect one `applied` run, about 166,000 records parsed (14 s). `psql "$DATABASE_URL" -c "select e.text, p.licence, p.source_url from content_graph.japanese_explanation e join content_graph.provenance p on p.id = e.provenance_id where e.approval='draft' limit 5"` shows `cc-by-sa-4.0` and a `ja.wiktionary.org/wiki/` link on every row, and `select count(*) from content_graph.generation_request where kind='sense_alignment'` is non-zero once any Word matched.
- **Idempotent rerun**: fire the job again. Expect no new row in `content_graph.import_run` and no new download in the worker log.
- **Staleness alarm**: `psql "$DATABASE_URL" -c "update content_graph.import_run set applied_at = now() - interval '40 days' where dataset='jmdict'"`, fire `import.staleness`. Expect one unresolved `content_graph.queue_entry` with reason `staleness alarm` and `detail.dataset = 'jmdict'`.
- **Second view of the stored value** for every journey: `psql "$DATABASE_URL" -c "select dataset, upstream_version, status, counts from content_graph.import_run order by applied_at desc nulls first"`.

## Gotchas

- ja Wiktionary: kanji spellings that are stubs pointing to a kana page (食べる, 会う) get no gloss yet; only entries on the headword page are imported (research: about two thirds of JLPT Words). Gaps go to the Japanese Explanation generator. Run on the real 2026-11-02 dump (parse only, no Compose stack).
- The `import` Postgres schema holds the slice's private tables. `import` is not a reserved word, but quote it in ad-hoc SQL if a client complains.
- A run held by the circuit breaker applies nothing and leaves only an `import_run` row (`breaker tripped`) and one `breaker tripped` queue entry. Releasing it is a rerun with `{ "release": true }`, which uses the kept raw files.
- Not run against the live release by the author; the parser was run on the real 3.6.2 files (13,108 characters).
- jmdict-simplified publishes only a `common` flag, so Word `priorityTags` is `["common"]` or `[]`. Pitch accent is `null` until the UniDic seed.
- The Content Approval queue screen is another slice. Until it ships, the link from the report goes to a route the shell answers with its home fallback.
- Not run end to end against the Compose stack by the author: no supervisor login exists until the account slice ships. The unit and Postgres tests cover the run, the schedule logic, the API roles and the screen.
