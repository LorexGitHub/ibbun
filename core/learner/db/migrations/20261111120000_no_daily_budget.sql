-- Learn has no daily limit any more (#189), so nothing writes preferences.daily_budget.
-- The column stays, so no Learner's row is rewritten and the release before this one keeps working.

ALTER TABLE preferences ALTER COLUMN daily_budget DROP NOT NULL;
