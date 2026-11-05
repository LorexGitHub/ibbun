# Grammar Points are seeded once, then owned by mojibun

JMdict, KANJIDIC2, KanjiVG and Tatoeba are refreshed on a schedule, with Overrides re-applied on top ([import-pipeline.md](../import-pipeline.md)). hanabira, our main Grammar Point source, is still being updated, so it could be treated the same way. We don't. hanabira is imported once, merged with the Tanos lists, and from then on Grammar Points belong to mojibun.

What we keep looks little like hanabira's records. Points are split into one per meaning, formation becomes structured slots, forms and register are added, and Japanese Explanations, Matcher Rules and levels are generated or reviewed. Almost every field would end up an Override, and most would go Stale on hanabira's next edit. Grammar Points don't need a refresh either: there is no licence condition like EDRDG's monthly-update rule, and a later hanabira fix is no more trustworthy than our approved text.

## Considered Options

- **Refresh hanabira like JMdict.** Picks up upstream fixes, but nearly every field turns into an Override that keeps going Stale, and splits per meaning have no upstream key to match against.
- **Write every Grammar Point from scratch.** No dependency on an unknown author, but it costs much more generation and review, and it loses the cross-check between hanabira and Tanos.

## Consequences

- No schedule, Import Runs after the first, or Override layer for Grammar Points. Corrections are plain edits that go through Content Approval.
- Provenance records the hanabira commit or Tanos list each point was seeded from. That is enough for the CC BY credits.
- Upstream hanabira changes are ignored. A later issue can diff a new hanabira release by hand if needed.
