# learning-path (core)

The core module that decides which New Study Items Learn offers next and which are Locked in Browse ([docs/learning-path.md](../../../../docs/learning-path.md)). It has no screen of its own. A Learner sees it through the `learn` slice (the batch it offers) and the `browse` slice (the Locked badge and Learn now). It stores only a random seed and the active Tracks for each Learner, in `learning_path.learner_path`. No order is stored.

## Sub-features

- 24 Tracks (Kanji, Words, Grammar, Listening × N5–N1 and Unlevelled). New Learners start with the four N5 Tracks.
- `next(learner, n)`: rounds over the active Tracks, easiest level first, with same-level dependencies pulled in on top.
- `forItem(learner, item)` for Learn now; `isLocked(learner, item)` for Browse.
- The strategy is picked by `LEARNING_PATH_STRATEGY` (default `frequency-v1`). Band sizes come from `LEARNING_PATH_KANJI_FREQUENCY_BAND` and `LEARNING_PATH_WORD_NF_TAGS_PER_BAND`.

## How to get to it (user POV)

Through Learn and Browse once those slices are built. Until then, it can only be checked through its tests and its table.

## Driving it with Playwright

Preconditions: baseline stack, and a Learner signed up through the account slice.

- **Seed stored once:** run `docker compose -p ibbun-verify exec postgres psql -U ibbun -c 'SELECT learner_id, seed, active_tracks FROM learning_path.learner_path'` after the Learner's first Learn screen. Expect one row with the four `N5:*` Tracks; a reload adds no second row and keeps the seed.
- **Learn batch order:** *Not built yet* (needs the `learn` slice).
- **Locked badge and Learn now:** *Not built yet* (needs the `browse` slice).

## Gotchas

- Two Learners see different first items from the same band; that is the seed tie-break, not a bug.
- Suspended items (no approved Example) are never offered and never block a Track.
- An N5 Word whose Kanji is N3 does not pull that Kanji in: dependencies are same-level only.
