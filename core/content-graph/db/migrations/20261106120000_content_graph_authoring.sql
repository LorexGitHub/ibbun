-- Authoring tables (docs/content-approval.md#wiring). Runs with search_path content_graph.

CREATE TABLE approval_decision (
  id uuid PRIMARY KEY,
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('approved', 'rejected', 'escalated', 'retired')),
  decider jsonb NOT NULL CHECK (decider->>'kind' IN ('reviewer', 'supervisor', 'derived')),
  verdicts jsonb NOT NULL DEFAULT '[]',
  reason text,
  at timestamptz NOT NULL
);
CREATE INDEX approval_decision_record ON approval_decision (record_id, at);

CREATE FUNCTION approval_decision_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval_decision is append-only';
END $$;
CREATE TRIGGER approval_decision_append_only BEFORE UPDATE OR DELETE ON approval_decision
  FOR EACH ROW EXECUTE FUNCTION approval_decision_append_only();

CREATE TABLE generation_request (
  id uuid PRIMARY KEY,
  target_id uuid NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('open', 'in review', 'done', 'failed'))
);
-- Idempotent per (target, kind) while one is open.
CREATE UNIQUE INDEX generation_request_live ON generation_request (target_id, kind)
  WHERE status IN ('open', 'in review');

CREATE TABLE generation_run (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES generation_request,
  model text NOT NULL,
  prompt_template_version text NOT NULL,
  inputs jsonb NOT NULL,
  tokens integer NOT NULL,
  cost double precision NOT NULL,
  at timestamptz NOT NULL
);

CREATE TABLE queue_entry (
  id uuid PRIMARY KEY,
  reason text NOT NULL,
  record_id uuid,
  import_run_id uuid REFERENCES import_run,
  generation_run_id uuid REFERENCES generation_run,
  generation_request_id uuid REFERENCES generation_request,
  detail jsonb,
  resolved boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL
);
CREATE INDEX queue_entry_open ON queue_entry (reason) WHERE NOT resolved;
