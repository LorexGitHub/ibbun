-- Words JMdict marks usually written in kana alone (`uk` on every sense). Additive: false until the next JMdict import sets it.
ALTER TABLE word ADD COLUMN usually_kana boolean NOT NULL DEFAULT false;
