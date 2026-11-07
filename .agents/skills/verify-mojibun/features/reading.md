# reading

Reading Passages and Batch Text episodes (`slices/reading`, issue #94). A Learner rereads the stories generated for them after Learn batches, taps Words for lookups and Sentences for translations. Practice Text passages are a later issue (#111).

## Sub-features

- **Episode list** (`/reading`): the Learner's own Batch Texts grouped per level (N5 to N1, then Unlevelled), episodes in order, each a link "Episode N: <title>". A text whose passage is not approved yet is left out. With none: "No stories yet."
- **Text screen** (`/reading/texts/:id`, `/reading/passages/:id`): title, "Episode N · level" for a Batch Text, Sentences in order with Words as buttons. Words of the Batch Text's batch carry `data-in-batch="true"`.
- **Tap-to-translate**: each Sentence with a translation has a "Show translation" button; the English stays hidden until tapped.
- **Lookup**: tapping a Word shows its form, reading and meanings in a status region and logs a `lookup` Review (`POST /api/reading/lookups`). It never introduces the Word or feeds the scheduler.
- **Furigana** per the Learner's `furigana` preference: On = every Word with kanji, Off = none, Mixed (default) = only Words still New (unlinked Words count as New).
- **API**: `GET /api/reading/episodes`, `GET /api/reading/batch-texts/:id`, `GET /api/reading/passages/:id`, `POST /api/reading/lookups`.

## How to get to it (user POV)

Sign in, then "Reading" in the nav (`/reading`). Pick an episode.

## Driving it with Playwright

Preconditions:

- The Compose stack, API and web app are up (the `verify-mojibun` skill does this) and the browser has a Learner session.
- A fresh Learner has no Batch Texts, so the page shows "No stories yet." To exercise the text screen, seed an approved Reading Passage (with Sentences, tokens and `sentence_uses_word` links) and a `progress` Batch Text row for the Learner pointing at it. `/reading/passages/<id>` needs only the passage.

Steps:

1. `page.goto("/reading")`; expect the heading "Reading", then an "Episode N:" link or "No stories yet."
2. Open the episode; click "Show translation" and expect that button to disappear for the Sentence.
3. Click a Word button; expect the lookup status region, and a `lookup` entry in the Learner's Review log.
4. Change the `furigana` preference (On, Off, Mixed), reload, and expect `rt` elements to follow the rule.

The spec is `slices/reading/tests/reading.spec.ts` (an episode or the empty state is accepted).

## Gotchas

- Furigana readings come from the stored Sudachi tokens (katakana, shown as hiragana). A Sentence without tokens renders as one plain run.
- Only Words linked by `sentence_uses_word` are tappable; particles and unlinked Words are plain text.
- Not built: highlighting earlier items (the Batch Text record stores only the batch's items), Grammar Point highlighting, Practice Text passages and their Generate screen (#111), reading from the end of Learn (#learn slice).
