-- The import slice's private tables. Runs with search_path import.

-- The latest normalised snapshot per dataset (import-pipeline.md#what-is-kept): diffing the next run needs it.
CREATE TABLE snapshot (
  dataset text PRIMARY KEY,
  upstream_version text NOT NULL
);

-- One row per record of that snapshot. A run writes only the keys it added, changed or lost.
CREATE TABLE snapshot_record (
  dataset text NOT NULL,
  key text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (dataset, key)
);

-- What each Import Run's diff against the previous snapshot found, for the report screen.
CREATE TABLE run_diff (
  import_run_id uuid PRIMARY KEY,
  added integer NOT NULL,
  changed integer NOT NULL,
  gone integer NOT NULL
);
