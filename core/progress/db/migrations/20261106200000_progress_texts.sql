-- A Learner's Batch Texts and Practice Texts (batch-text.md#storage, listening.md#practice-texts).
-- The passages live in content-graph; these rows are Learner data. Everything past the shared
-- columns is in `detail`, parsed by the Texts schema.

CREATE TABLE texts (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('batch', 'practice')),
  learner_id uuid NOT NULL,
  level text NOT NULL CHECK (level IN ('N5', 'N4', 'N3', 'N2', 'N1', 'unlevelled')),
  passage_id uuid NOT NULL,
  at timestamptz NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX texts_learner_kind ON texts (learner_id, kind, at, seq);
