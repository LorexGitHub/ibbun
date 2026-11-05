# JLPT Levels are computed from ranked Level Candidates

A Study Item's JLPT Level can come from a published list (Tanos, hanabira), from a deterministic rule (jōyō Kanji → N1) or from a person fixing a mistake. Lists get refreshed; rules get new versions; people correct both. If the level were one mutable field, a refresh would overwrite a correction, and a correction would hide what the list said. So each source writes its own **Level Candidate** with its own Provenance, and the current level is computed from the Approved candidates by a fixed precedence: Editorial > List > Derived. A Study Item with no Approved candidate is Unlevelled.

Words take their List candidates from yomitan-jlpt-vocab (Tanos mapped to JMdict `ent_seq`, CC BY-SA 4.0). Its ShareAlike costs nothing, because the Words are already BY-SA through JMdict. Kanji take theirs from the Tanos kanji lists. KANJIDIC2's pre-2010 level only flags disagreements.

## Considered Options

- **One level field, overwritten by the winning source.** Simplest storage, but every refresh has to know which fields a person has corrected, which repeats the Override layer in a worse form.
- **Use the Override layer for corrections.** Overrides fix an upstream value of one record. A level can come from several upstreams at once, and a Derived level has no upstream record to override.
- **Map Tanos rows to JMdict ourselves.** Keeps the licence plain CC BY, but redoes a fuzzy join that already exists, and buys nothing because JMdict is BY-SA anyway.

## Consequences

- The current level is a view rebuilt by the derived-level process in `content-graph`, together with the computed levels of Sentences, Reading Passages and Listening Clips.
- Refreshing Tanos or hanabira can never undo an Editorial fix, and retiring the fix brings the List level back.
- A bad rebuild or refresh can re-level many items at once; a circuit breaker stops runs that change more than 100 current levels.
