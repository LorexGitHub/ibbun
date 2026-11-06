-- The derived-level process cache (docs/jlpt-levels.md#the-derived-level-process). Runs with search_path content_graph.

-- One row per process: the version its cache was last built with, and the Provenance of its Derived candidates.
CREATE TABLE level_process (
  process text PRIMARY KEY,
  version text NOT NULL,
  provenance_id uuid NOT NULL REFERENCES provenance
);

-- The current level of Study Items and the computed level of Sentences, Reading Passages and Listening Clips.
-- A cache: rebuildable from Level Candidates and links at any time.
CREATE TABLE computed_level (
  record_id uuid PRIMARY KEY,
  record_table text NOT NULL CHECK (record_table IN ('study_item', 'sentence', 'reading_passage', 'listening_clip')),
  level text CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  unlevelled_word_count integer NOT NULL DEFAULT 0
);
CREATE INDEX computed_level_level ON computed_level (record_table, level);
