-- The append-only Review log (docs/adr/0001-fsrs-6-and-anki-style-mastery.md).
-- It is the source of truth: Schedule, Mastery, Known and Introduced are folds over it.
-- Rows are never updated or deleted; the triggers below refuse both.

CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  learner_id uuid NOT NULL,
  study_item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('srs', 'manual', 'learn', 'wrap-up', 'ghost', 'cram', 'lookup')),
  passed boolean NOT NULL,
  at timestamptz NOT NULL,
  -- Everything else a Review records (review-answer-model.md, listening.md), parsed by the Review schema.
  detail jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX reviews_learner_item ON reviews (learner_id, study_item_id, at, seq);

CREATE FUNCTION refuse_review_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the Review log is append-only';
END;
$$;

CREATE TRIGGER reviews_append_only BEFORE UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refuse_review_change();

CREATE TRIGGER reviews_no_truncate BEFORE TRUNCATE ON reviews
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_review_change();
