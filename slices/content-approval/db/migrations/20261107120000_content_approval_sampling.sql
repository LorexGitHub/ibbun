-- Supervisor spot-check sampling (docs/content-approval.md#supervisor-spot-checks). Runs with search_path content_approval.
-- Private to the content-approval slice: sampling state is nobody else's business.

CREATE TABLE sample (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('example', 'japanese-explanation', 'listening-clip')),
  reason text NOT NULL CHECK (reason IN ('calibration', 'random', 'held', 're-review')),
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
  primary_table text NOT NULL,
  primary_id uuid NOT NULL,
  unit jsonb NOT NULL,
  decision_id uuid,
  request_id uuid,
  model text,
  rubric_version text,
  note text,
  at timestamptz NOT NULL,
  settled_at timestamptz
);
CREATE INDEX sample_open ON sample (kind, at) WHERE status = 'pending';

CREATE TABLE kind_state (
  kind text PRIMARY KEY CHECK (kind IN ('example', 'japanese-explanation', 'listening-clip')),
  version text,
  calibration_left integer NOT NULL,
  paused boolean NOT NULL,
  resumed_at timestamptz,
  cursor timestamptz
);
