-- The speaker of each line of a dialogue Reading Passage (listening.md#practice-texts). Additive: null on prose lines.
ALTER TABLE passage_contains_sentence ADD COLUMN speaker text CHECK (speaker IN ('男', '女'));
