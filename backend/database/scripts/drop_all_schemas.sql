-- DANGER: irreversible reset script.
-- Drops ALL non-system schemas (including app/auth/storage/realtime/etc.) and recreates public.
-- Run only when you intend to fully wipe a Supabase project database.

BEGIN;

DO $$
DECLARE
    schema_rec RECORD;
BEGIN
    FOR schema_rec IN
        SELECT nspname AS schema_name
        FROM pg_namespace
        WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND nspname NOT LIKE 'pg_temp_%'
          AND nspname NOT LIKE 'pg_toast_temp_%'
    LOOP
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE;', schema_rec.schema_name);
    END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS public;

-- Restore common Supabase role permissions on fresh public schema.
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

COMMIT;
