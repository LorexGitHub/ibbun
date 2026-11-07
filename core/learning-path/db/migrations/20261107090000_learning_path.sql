-- Each Learner's Learning Path state (docs/learning-path.md#storage-and-swapping).
-- Only a seed and the active Tracks are stored. No order is: the strategy recomputes it.

CREATE TABLE learner_path (
  learner_id uuid PRIMARY KEY,
  -- Set once, at sign-up. The per-Learner tie-break is hash(seed, Study Item ID).
  seed text NOT NULL,
  -- Track keys such as "N4:kanji" or "unlevelled:word".
  active_tracks text[] NOT NULL
);
