-- Accounts, login methods, sessions, verification tokens, rate limits and
-- preferences (docs/accounts.md). Better Auth reads and writes the first four
-- through the Drizzle schema in src/tables.ts; keep the two in step.

CREATE TABLE learners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Better Auth requires a name. mojibun does not ask for one.
  name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  role text NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'supervisor')),
  deactivated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Better Auth's "account" table: one row per login method (password now; OAuth and passkeys later).
CREATE TABLE login_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners (id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  password text,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX login_methods_learner ON login_methods (learner_id);

-- updated_at is when the session was last used, to the day (it is extended at most once a day).
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_learner ON sessions (learner_id);

-- Password reset tokens, stored hashed.
CREATE TABLE verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_identifier ON verifications (identifier);

-- Fixed-window counters, one per key (an IP or an email, plus the path).
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);

-- No row means the defaults in src/preferences.ts.
CREATE TABLE preferences (
  learner_id uuid PRIMARY KEY REFERENCES learners (id) ON DELETE CASCADE,
  furigana text NOT NULL CHECK (furigana IN ('on', 'off', 'mixed')),
  convert_romaji boolean NOT NULL,
  explanations text NOT NULL CHECK (explanations IN ('english', 'japanese', 'both')),
  exam_mode boolean NOT NULL,
  slow_audio boolean NOT NULL,
  batch_size integer NOT NULL CHECK (batch_size BETWEEN 1 AND 20),
  daily_budget integer NOT NULL CHECK (daily_budget BETWEEN 0 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
