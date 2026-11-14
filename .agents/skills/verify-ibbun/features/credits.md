# credits

The public Credits page at `/credits`. Anyone, signed in or not, sees every source ibbun uses with its licence, a link, and the version and date currently live. Below the table it says that JLPT levels are estimates and credits Jonathan Waller and stephenmk with links, then prints the UniDic BSD notice. Every `VOICEVOX:<character>` in use is listed after the sources. The footer's Credits link on every screen leads here.

## Sub-features

- `credits-sources` lists JMdict, KANJIDIC2, KRADFILE, JmdictFurigana, KanjiVG, Tatoeba, Waller/Tanos, yomitan-jlpt-vocab (stephenmk), hanabira, UniDic and Wiktionary (ja), each a link with its licence name.
- `credits-live-version` shows `<version> · <date>` for a source with an applied Import Run, and `not imported yet` for one without.
- `credits-voices` adds one `VOICEVOX:<character>` row per voice that a Listening Clip's Provenance names.
- `credits-level-note` says levels are estimates and links Jonathan Waller and stephenmk.
- `credits-unidic` prints the UniDic copyright line and the three-clause BSD text.
- `credits-api` answers `GET /api/credits` without a session.

## How to get to it (user POV)

- Click `Credits` in the footer of any screen, or open `http://localhost:5173/credits`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.
- For a live version, one applied Import Run exists: `psql "$DATABASE_URL" -c "insert into content_graph.import_run (id,dataset,upstream_version,checksum,status,counts,applied_at) values (gen_random_uuid(),'jmdict','2026-11-02','x','applied','{}',now())"`. For a voice row, a `provenance` row with licence `voicevox` and an author must exist; no slice writes one yet.

- **Sources.** Run `verify.sh shot /credits credits/page`. `page.aria.txt` has a `Credits` level-1 heading and a table row with a link for each source listed in `credits-sources`.
- **Live version.** In `page.aria.txt` the JMdict row ends `2026-11-02 · <today>` after the insert above; every other row ends `not imported yet`.
- **Level note.** `page.aria.txt` has the heading `JLPT levels are estimates` and links named `Jonathan Waller` and `stephenmk`.
- **UniDic.** `page.aria.txt` contains `National Institute for Japanese Language and Linguistics` and `Neither the name of the copyright holder`.
- **Footer entry.** Open `/`, click the `Credits` link in the footer. The URL becomes `/credits`.
- **No sign-in.** Run `curl -s http://localhost:5173/api/credits`. It prints JSON starting `{"credits":[{"name":"JMdict"`, with no cookie sent.
- **Slice spec.** `slices/credits/tests/credits.spec.ts` covers the footer journey. It runs in the `learner` project, which exists once `slices/account/register.ts` does; until then run it with a config whose `testMatch` is `slices/*/tests/**/*.spec.ts`.

## Gotchas

- The page has no nav entry; only the footer links to it.
- A fresh database has no Import Run, so every row reads `not imported yet`. That is correct, not a failure.
- If `DATABASE_URL` is unset the API answers `/api/credits` with a 500; `verify.sh up` sets it.
- If `/api/credits` fails, the page is an alert "Not loaded · The credits did not load" with **Try again**, which asks again.
