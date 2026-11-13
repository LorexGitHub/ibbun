-- The project's own content was licensed as 'mojibun' before the rename. A
-- database made before it keeps the old CHECK and rows; this moves both to 'ibbun'.
ALTER TABLE provenance DROP CONSTRAINT provenance_licence_check;
UPDATE provenance SET licence = 'ibbun' WHERE licence = 'mojibun';
ALTER TABLE provenance ADD CONSTRAINT provenance_licence_check CHECK (licence IN (
  'edrdg', 'cc-by-sa-4.0', 'cc-by-sa-3.0', 'cc-by-2.0-fr', 'cc-by-4.0', 'cc-by',
  'bsd-3-clause', 'voicevox', 'cc0', 'ibbun'));
