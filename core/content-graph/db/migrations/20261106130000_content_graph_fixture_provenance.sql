-- Provenance `fixture`: the hand-made dev/test graph (#58). Additive: widens the allowed source kinds.
ALTER TABLE provenance DROP CONSTRAINT provenance_source_check;
ALTER TABLE provenance ADD CONSTRAINT provenance_source_check
  CHECK (source->>'kind' IN ('import', 'derived', 'generated', 'authored', 'fixture'));
