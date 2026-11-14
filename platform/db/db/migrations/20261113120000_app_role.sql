-- The app connects as ibbun_app: it reads and writes every package schema but owns none.
-- Migrations keep running as the role that owns the schemas.
DO $$
BEGIN
  -- Roles belong to the whole server, which test databases share with each other.
  CREATE ROLE ibbun_app LOGIN;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rds_iam') THEN
    GRANT rds_iam TO ibbun_app;
  ELSE
    -- Only a local or CI Postgres gets here; Aurora signs in with IAM tokens instead.
    ALTER ROLE ibbun_app PASSWORD 'ibbun_app';
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;

DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('public', 'information_schema') AND nspname NOT LIKE 'pg\_%'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO ibbun_app', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ibbun_app', s);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO ibbun_app', s);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO ibbun_app', s);
  END LOOP;
END
$$;

-- Schemas and tables that later migrations create.
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO ibbun_app;
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ibbun_app;
ALTER DEFAULT PRIVILEGES GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ibbun_app;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO ibbun_app;
