-- Guests of the showcase stage (ADR 0017, #282): a Learner with no email of its own.
-- Purged by age, so the purge finds them by this flag and created_at.

ALTER TABLE learners ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
CREATE INDEX learners_guests ON learners (created_at) WHERE is_anonymous;
