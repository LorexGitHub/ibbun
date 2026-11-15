-- Grammar fields are sampled too (SAMPLE_KINDS). Runs with search_path content_approval.

ALTER TABLE sample DROP CONSTRAINT sample_kind_check;
ALTER TABLE sample ADD CONSTRAINT sample_kind_check CHECK (kind IN ('example', 'japanese-explanation', 'grammar-fields', 'listening-clip'));

ALTER TABLE kind_state DROP CONSTRAINT kind_state_kind_check;
ALTER TABLE kind_state ADD CONSTRAINT kind_state_kind_check CHECK (kind IN ('example', 'japanese-explanation', 'grammar-fields', 'listening-clip'));
