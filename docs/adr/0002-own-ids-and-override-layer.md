# Content Graph records use ibbun-owned IDs; our edits live in a separate override layer

EDRDG's licence makes us re-import JMdict and KANJIDIC2 at least monthly, and JMdict entries get merged, split and deleted between releases. Reviews are an append-only log and must never point at an ID that a re-import can change. So every Content Graph record gets a ibbun-owned ID (UUIDv7). The upstream key (JMdict `ent_seq`, the Kanji literal, the Tatoeba sentence id, the hanabira slug) lives in a separate source-key mapping. Records are retired, never deleted.

Our own corrections to imported data (a fixed gloss, a fixed reading) are stored as override records with their own Provenance, never as edits to the imported row. A re-import can then replace the source data wholesale and re-apply the overrides. The overrides also mark exactly where ShareAlike-derived material ends and our own content starts.

## Considered Options

- **Source keys as primary keys.** Simpler joins, but a JMdict merge or split would orphan Reviews and Examples.
- **Edit imported rows in place.** Simpler writes, but the next refresh would silently undo our edits, and the BY-SA boundary could no longer be audited.
