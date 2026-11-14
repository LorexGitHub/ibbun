# Import and refresh pipeline

Decided in [#23](https://github.com/LorexGitHub/ibbun/issues/23). Terms follow [CONTEXT.md](../CONTEXT.md). The shape of the data is in [content-graph.md](content-graph.md); why IDs work the way they do is in [ADR 0002](adr/0002-own-ids-and-override-layer.md) and [ADR 0004](adr/0004-owned-sub-entry-ids-and-derived-links-as-cache.md).

## Schedule

| Dataset | Upstream | Cadence | Why |
|---|---|---|---|
| JMdict, KANJIDIC2 (+ KRADFILE) | jmdict-simplified release (published every Monday) | Monthly, first Monday of the month | EDRDG licence: web dictionary servers must update at least monthly |
| Tatoeba sentences, translations, `jpn_indices` | `downloads.tatoeba.org/exports` (Saturday 06:30 UTC) | Weekly, after the export | Sentence corrections and author credits |
| KanjiVG | GitHub release tag | Checked weekly, applied only on a new tag | Irregular releases |
| yomitan-jlpt-vocab (Tanos Words → JMdict) | GitHub release | Checked weekly, applied only on a new release | Word Level Candidates ([jlpt-levels.md](jlpt-levels.md)) |
| Tanos kanji lists | Wayback Machine snapshot `20200117222855` (tanos.co.uk is gone) | Once: tried daily until KANJIDIC2 is in, then never again | Kanji Level Candidates ([jlpt-levels.md](jlpt-levels.md)) |

Refreshes run as scheduled `worker` jobs (SQS) owned by the `import` slice. No human starts them.

### Circuit breaker

A refresh applies on its own unless it would do any of the following. Then it stops before apply, and the Import Run waits for the supervisor in the Content Approval queue.

- Retire or change more than **0.5%** of a dataset's records.
- Send more than **50** Approved Examples back to Draft.
- Retire any Study Item that has a JLPT Level and no successor.
- Change the current JLPT Level of more than **100** Study Items ([jlpt-levels.md](jlpt-levels.md#when-a-level-changes)).

The thresholds are config values, not code.

## One Import Run

Every refresh, scheduled or replayed, is an **Import Run**: dataset, upstream version, checksum of the upstream files, status, counts. All Provenance written by the run points at it.

1. **Stage.** Fetch the upstream files and parse them into a normalised snapshot in staging tables. Parsing is the `import` slice's only job.
2. **Diff.** Compare the snapshot with the previous run's snapshot for the same dataset: keys added, changed and gone.
3. **Apply.** One transaction per dataset, through `content-graph/authoring.applySnapshot(dataset, run, records)`. The rules below live in that core function, not in the slice.
4. **Report.** What was added, changed and Retired, which overrides went Stale or Orphaned, which Examples went back to Draft, which Study Items were Suspended, and whether the breaker tripped. The report links into the Content Approval queue, filtered to the run. The supervisor spot-checks it.

A rerun of the same upstream version changes nothing (idempotent).

### What is kept

- The normalised snapshot of the latest run per dataset, in Postgres. Diffing and override checks need it.
- The raw upstream files of the last 3 runs per dataset, on a Docker volume, so a run can be replayed. Older raw files are deleted.

## Mapping upstream changes

Every record is found through the `source_key` table: (dataset, upstream key) → ibbun ID. Upstream keys: JMdict `ent_seq`, the Kanji literal, the Tatoeba sentence id, the KanjiVG code point. yomitan-jlpt-vocab rows point at JMdict `ent_seq`.

### New key

A new record with a new ibbun ID. Its approval state is the default for its source (JMdict and KANJIDIC2 Approved, Tatoeba Draft).

### Key gone: deletion or merge

JMdict publishes no merge records: a merged or deleted entry just disappears. So:

1. The record is **Retired**.
2. **Successor detection.** If every (written form, reading) pair of the gone entry now appears in exactly one surviving entry, a **superseded by** link to that entry is recorded. It is a derived link and arrives Approved. Otherwise there is no successor.
3. If there is a successor:
   - The Retired Word's `browse` page redirects to it.
   - Its Approved Examples are copied to the successor as **Draft** Examples, queued with reason `superseded`.
   - Its current JLPT Level is copied to the successor as a **Draft Editorial** Level Candidate ([jlpt-levels.md](jlpt-levels.md)).
   - Its overrides become Orphaned (below), with the successor suggested as the new target. Nothing moves on its own.

**Learner progress does not follow the link.** The successor is a new Study Item and starts as New for every Learner. It appears in Learn like any other, with no notice. The Retired Word drops out of the Learner's due Reviews and counts; their past Reviews of it stay in their history. Nothing is shown to the Learner when this happens, with or without a successor.

### Key split

JMdict keeps the old `ent_seq` on one half and gives the other half a new one. The kept half is a changed record; the new half is a new Word. Nothing else is needed.

### Key changed

The record keeps its ibbun ID. The imported data is replaced wholesale, then matched inside the record:

- **Written forms and readings** have ibbun IDs and are matched by their text, which is a natural key. Pitch accent hangs off the reading ID.
- **Senses** have ibbun IDs and are matched by a fingerprint (part of speech plus normalised glosses), falling back to closest similarity above a threshold. A sense with no confident match gets a new ID. The records hanging off the old sense (Japanese Explanation, Sentence uses Word links that name it, Examples, overrides) go back to Draft and are queued with reason `unmatched sense`. They are never re-pointed silently.

## Overrides

Each override stores the upstream value it replaced ("based on"). After the imported data is replaced:

| Upstream since the override | Result |
|---|---|
| Unchanged | Re-applied silently |
| Changed | Still applied, marked **Stale**, queued. Upstream may have fixed the same thing |
| Target gone (record Retired, sense unmatched) | **Orphaned**: kept, inactive, queued with a suggested target if there is a successor |

Overrides are never deleted. They mark where ShareAlike material ends and our own content starts.

## Tatoeba

- **Scope.** Only Japanese Sentences with at least one English translation. One translation is chosen by a fixed rule: the lowest translation id whose owner is a native English speaker, otherwise the lowest id. If it disappears, the rule picks the next one, and that counts as a translation change. Revisit when more languages arrive.
- **Text changed.** Tokens are rebuilt. For each Example on the Sentence: if the old target text still appears exactly once, its span is moved and it stays Approved; otherwise it goes back to Draft.
- **Translation changed.** Every Example on the Sentence goes back to Draft, because the translation is part of what was approved.
- **Sentence deleted.** Retired.
- **Author changed.** Credit data updated only.

## Derived links

Derived links (Word contains Kanji, Sudachi-derived Sentence uses Word, Listening Clip voices Sentence, superseded by) are a cache of a process version plus its inputs. Nothing points at them, so rebuilds **replace** them instead of retiring them.

- **Incremental rebuild** when a record's input hash changes.
- **Full rebuild** when the process version changes, for example a SudachiDict upgrade.

**Sentence uses Word:** where `jpn_indices` covers a Sentence, it wins, because it is sense-level and its tokens can be human-checked. Sudachi supplies token readings for every Sentence, and links only for Sentences `jpn_indices` doesn't cover. Reading fixes are overrides.

## Suspended Study Items

When a refresh leaves a Study Item with no Approved Example, it is **Suspended**: not due and not offered in Learn. A generation request for new Examples is queued automatically, and the item comes back as soon as one is approved.

## The queue

Everything a refresh flags goes into the one Content Approval queue, tagged with a reason: `stale override`, `orphaned override`, `example redrafted`, `superseded`, `unmatched sense`, `suspended`, `breaker tripped`.
