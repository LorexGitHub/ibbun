-- pg-boss kept its queue in this schema. Jobs now go through SQS (ADR 0015), so nothing reads it.
DROP SCHEMA IF EXISTS jobs CASCADE;
