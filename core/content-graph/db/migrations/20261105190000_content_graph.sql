-- The Content Graph (docs/content-graph.md). Runs with search_path content_graph.
-- Every record carries approval, retired and provenance_id; nothing is hard-deleted
-- except derived links (ADR 0002, ADR 0004).

CREATE TABLE import_run (
  id uuid PRIMARY KEY,
  dataset text NOT NULL,
  upstream_version text NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE provenance (
  id uuid PRIMARY KEY,
  source jsonb NOT NULL CHECK (source->>'kind' IN ('import', 'derived', 'generated', 'authored')),
  licence text NOT NULL CHECK (licence IN (
    'edrdg', 'cc-by-sa-4.0', 'cc-by-sa-3.0', 'cc-by-2.0-fr', 'cc-by-4.0', 'cc-by',
    'bsd-3-clause', 'voicevox', 'cc0', 'mojibun')),
  author text,
  source_url text,
  inputs uuid[] NOT NULL DEFAULT '{}'
);

CREATE DOMAIN approval AS text CHECK (VALUE IN ('draft', 'approved', 'rejected'));

CREATE TABLE study_item (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('kanji', 'word', 'grammar_point', 'listening_clip')),
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);

CREATE TABLE kanji (
  study_item_id uuid PRIMARY KEY REFERENCES study_item,
  literal text NOT NULL UNIQUE,
  meanings text[] NOT NULL,
  on_readings text[] NOT NULL,
  kun_readings text[] NOT NULL,
  grade integer,
  frequency integer,
  stroke_count integer NOT NULL,
  components text[] NOT NULL,
  strokes text[] NOT NULL,
  known_wrong_meanings jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE word (
  study_item_id uuid PRIMARY KEY REFERENCES study_item,
  priority_tags text[] NOT NULL
);

CREATE TABLE word_form (
  id uuid PRIMARY KEY,
  word_id uuid NOT NULL REFERENCES word,
  position integer NOT NULL,
  text text NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX word_form_word ON word_form (word_id);
CREATE INDEX word_form_text ON word_form (lower(text) text_pattern_ops);

CREATE TABLE word_reading (
  id uuid PRIMARY KEY,
  word_id uuid NOT NULL REFERENCES word,
  position integer NOT NULL,
  text text NOT NULL,
  pitch_accent integer[],
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX word_reading_word ON word_reading (word_id);
CREATE INDEX word_reading_text ON word_reading (lower(text) text_pattern_ops);

CREATE TABLE word_sense (
  id uuid PRIMARY KEY,
  word_id uuid NOT NULL REFERENCES word,
  position integer NOT NULL,
  parts_of_speech text[] NOT NULL,
  glosses text[] NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX word_sense_word ON word_sense (word_id);

CREATE TABLE grammar_point (
  study_item_id uuid PRIMARY KEY REFERENCES study_item,
  title text NOT NULL,
  forms jsonb NOT NULL,
  formation jsonb NOT NULL,
  register text NOT NULL CHECK (register IN ('casual', 'neutral', 'polite', 'formal')),
  meaning text NOT NULL,
  notes text,
  matcher_rule jsonb
);

CREATE TABLE listening_clip (
  study_item_id uuid PRIMARY KEY REFERENCES study_item,
  kind text NOT NULL CHECK (kind IN ('sentence', 'dialogue'))
);

CREATE TABLE japanese_explanation (
  id uuid PRIMARY KEY,
  word_sense_id uuid REFERENCES word_sense,
  grammar_point_id uuid REFERENCES grammar_point,
  text text NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance,
  CHECK ((word_sense_id IS NULL) <> (grammar_point_id IS NULL))
);
CREATE INDEX japanese_explanation_sense ON japanese_explanation (word_sense_id);
CREATE INDEX japanese_explanation_grammar ON japanese_explanation (grammar_point_id);

CREATE TABLE sentence (
  id uuid PRIMARY KEY,
  text text NOT NULL,
  translation_en text,
  tokens jsonb NOT NULL DEFAULT '[]',
  audio_key text,
  audio_voice text,
  unlevelled_word_count integer NOT NULL DEFAULT 0,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);

CREATE TABLE reading_passage (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  form text NOT NULL CHECK (form IN ('prose', 'dialogue')),
  comprehension_questions jsonb NOT NULL DEFAULT '[]',
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance,
  CHECK (form = 'dialogue' OR comprehension_questions = '[]')
);

CREATE TABLE example (
  id uuid PRIMARY KEY,
  sentence_id uuid NOT NULL REFERENCES sentence,
  study_item_id uuid NOT NULL REFERENCES study_item,
  span_start integer NOT NULL,
  span_end integer NOT NULL CHECK (span_end >= span_start),
  target_sense_id uuid REFERENCES word_sense,
  hint text,
  comprehension_question jsonb,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX example_study_item ON example (study_item_id);

CREATE TABLE example_answer (
  id uuid PRIMARY KEY,
  example_id uuid NOT NULL REFERENCES example,
  kind text NOT NULL CHECK (kind IN ('accepted', 'alternate', 'known_wrong')),
  written text NOT NULL,
  reading text,
  message text,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX example_answer_example ON example_answer (example_id);

-- Links. Derived ones arrive approved and are replaced on rebuild (ADR 0004).

CREATE TABLE word_contains_kanji (
  id uuid PRIMARY KEY,
  word_id uuid NOT NULL REFERENCES word,
  kanji_id uuid NOT NULL REFERENCES kanji,
  position integer NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX word_contains_kanji_word ON word_contains_kanji (word_id);
CREATE INDEX word_contains_kanji_kanji ON word_contains_kanji (kanji_id);

CREATE TABLE sentence_uses_word (
  id uuid PRIMARY KEY,
  sentence_id uuid NOT NULL REFERENCES sentence,
  word_id uuid NOT NULL REFERENCES word,
  form_id uuid REFERENCES word_form,
  reading_id uuid REFERENCES word_reading,
  sense_id uuid REFERENCES word_sense,
  span_start integer NOT NULL,
  span_end integer NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX sentence_uses_word_sentence ON sentence_uses_word (sentence_id);
CREATE INDEX sentence_uses_word_word ON sentence_uses_word (word_id);

CREATE TABLE sentence_demonstrates_grammar (
  id uuid PRIMARY KEY,
  sentence_id uuid NOT NULL REFERENCES sentence,
  grammar_point_id uuid NOT NULL REFERENCES grammar_point,
  span_start integer NOT NULL,
  span_end integer NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX sentence_demonstrates_grammar_sentence ON sentence_demonstrates_grammar (sentence_id);
CREATE INDEX sentence_demonstrates_grammar_point ON sentence_demonstrates_grammar (grammar_point_id);

CREATE TABLE clip_voices_sentence (
  id uuid PRIMARY KEY,
  clip_id uuid NOT NULL REFERENCES listening_clip,
  sentence_id uuid NOT NULL REFERENCES sentence,
  position integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('男', '女')),
  voice text NOT NULL,
  audio_key text,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX clip_voices_sentence_clip ON clip_voices_sentence (clip_id);

CREATE TABLE passage_contains_sentence (
  id uuid PRIMARY KEY,
  passage_id uuid NOT NULL REFERENCES reading_passage,
  sentence_id uuid NOT NULL REFERENCES sentence,
  position integer NOT NULL,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX passage_contains_sentence_passage ON passage_contains_sentence (passage_id);

CREATE TABLE grammar_relates_to (
  id uuid PRIMARY KEY,
  from_id uuid NOT NULL REFERENCES grammar_point,
  to_id uuid NOT NULL REFERENCES grammar_point,
  kind text NOT NULL CHECK (kind IN ('see_also', 'contrast')),
  comparison text,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX grammar_relates_to_from ON grammar_relates_to (from_id);
CREATE INDEX grammar_relates_to_to ON grammar_relates_to (to_id);

CREATE TABLE word_superseded_by (
  id uuid PRIMARY KEY,
  retired_word_id uuid NOT NULL REFERENCES word,
  word_id uuid NOT NULL REFERENCES word,
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);

CREATE TABLE source_key (
  dataset text NOT NULL,
  upstream_key text NOT NULL,
  record_id uuid NOT NULL,
  PRIMARY KEY (dataset, upstream_key)
);
CREATE INDEX source_key_record ON source_key (record_id);

CREATE TABLE override (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL,
  field text NOT NULL,
  value jsonb NOT NULL,
  based_on jsonb,
  state text NOT NULL CHECK (state IN ('active', 'stale', 'orphaned')),
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX override_record ON override (record_id);

CREATE TABLE level_candidate (
  id uuid PRIMARY KEY,
  study_item_id uuid NOT NULL REFERENCES study_item,
  level text NOT NULL CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1')),
  kind text NOT NULL CHECK (kind IN ('editorial', 'list', 'derived')),
  approval approval NOT NULL,
  retired boolean NOT NULL DEFAULT false,
  provenance_id uuid NOT NULL REFERENCES provenance
);
CREATE INDEX level_candidate_item ON level_candidate (study_item_id);
CREATE INDEX level_candidate_level ON level_candidate (level);

-- What search matches: every searchable text of a visible Study Item, after
-- overrides. src/read.ts searchTexts() is the same rule for the fake; the
-- contract tests hold the two together.
CREATE VIEW search_text AS
WITH applied AS (
  SELECT DISTINCT ON (record_id, field) record_id, field, value
  FROM override
  WHERE approval = 'approved' AND NOT retired AND state = 'active'
  ORDER BY record_id, field, id DESC
),
base (study_item_id, record_id, field, value) AS (
  SELECT word_id, id, 'text', to_jsonb(text) FROM word_form WHERE approval = 'approved' AND NOT retired
  UNION ALL
  SELECT word_id, id, 'text', to_jsonb(text) FROM word_reading WHERE approval = 'approved' AND NOT retired
  UNION ALL
  SELECT word_id, id, 'glosses', to_jsonb(glosses) FROM word_sense WHERE approval = 'approved' AND NOT retired
  UNION ALL
  SELECT study_item_id, study_item_id, f.field, f.value
  FROM kanji, LATERAL (VALUES
    ('literal', to_jsonb(literal)), ('meanings', to_jsonb(meanings)),
    ('onReadings', to_jsonb(on_readings)), ('kunReadings', to_jsonb(kun_readings))) f (field, value)
  UNION ALL
  SELECT study_item_id, study_item_id, f.field, f.value
  FROM grammar_point, LATERAL (VALUES ('title', to_jsonb(title)), ('meaning', to_jsonb(meaning))) f (field, value)
),
current AS (
  SELECT b.study_item_id, coalesce(a.value, b.value) AS value
  FROM base b LEFT JOIN applied a ON a.record_id = b.record_id AND a.field = b.field
)
SELECT c.study_item_id, t.text
FROM current c
JOIN study_item s ON s.id = c.study_item_id AND s.approval = 'approved' AND NOT s.retired
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE jsonb_typeof(c.value) WHEN 'array' THEN c.value ELSE jsonb_build_array(c.value) END
) AS t (text);
