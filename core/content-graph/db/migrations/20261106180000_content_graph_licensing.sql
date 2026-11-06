-- Licences and Attribution (docs/licensing.md). Runs with search_path content_graph.

-- When an Import Run went live: the newest per dataset is the version Credits shows.
ALTER TABLE import_run ADD COLUMN applied_at timestamptz;

-- Each record's Provenance, so Attribution can follow Provenance inputs (record ids) transitively.
CREATE VIEW record_provenance AS
  SELECT id AS record_id, provenance_id FROM study_item
  UNION ALL
  SELECT id AS record_id, provenance_id FROM word_form
  UNION ALL
  SELECT id AS record_id, provenance_id FROM word_reading
  UNION ALL
  SELECT id AS record_id, provenance_id FROM word_sense
  UNION ALL
  SELECT id AS record_id, provenance_id FROM japanese_explanation
  UNION ALL
  SELECT id AS record_id, provenance_id FROM sentence
  UNION ALL
  SELECT id AS record_id, provenance_id FROM reading_passage
  UNION ALL
  SELECT id AS record_id, provenance_id FROM example
  UNION ALL
  SELECT id AS record_id, provenance_id FROM example_answer
  UNION ALL
  SELECT id AS record_id, provenance_id FROM word_contains_kanji
  UNION ALL
  SELECT id AS record_id, provenance_id FROM sentence_uses_word
  UNION ALL
  SELECT id AS record_id, provenance_id FROM sentence_demonstrates_grammar
  UNION ALL
  SELECT id AS record_id, provenance_id FROM clip_voices_sentence
  UNION ALL
  SELECT id AS record_id, provenance_id FROM passage_contains_sentence
  UNION ALL
  SELECT id AS record_id, provenance_id FROM grammar_relates_to
  UNION ALL
  SELECT id AS record_id, provenance_id FROM word_superseded_by
  UNION ALL
  SELECT id AS record_id, provenance_id FROM override
  UNION ALL
  SELECT id AS record_id, provenance_id FROM level_candidate
;
