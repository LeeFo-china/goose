-- ISOLATED EMPTY PostgreSQL DATABASE ONLY. No real keys or production data.
-- Run with psql --dbname=<disposable-local-database> --file=supabase/tests/ai_provider_restricted_delete.sql
-- This fixture intentionally leaves its minimal tables for optional two-session race checks.
-- It is not a migration and must never be run against an application database.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Fixture requires an empty disposable database';
  END IF;
END;
$$;

CREATE TABLE public.ai_providers (id uuid PRIMARY KEY, name text NOT NULL, version integer NOT NULL);
CREATE TABLE public.ai_models (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE
);
CREATE INDEX ai_models_provider_id_idx ON public.ai_models(provider_id);
CREATE TABLE public.ai_model_catalog_sync_runs (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE RESTRICT
);
CREATE TABLE public.ai_model_catalog_entries (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.ai_model_catalog_sync_runs(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE RESTRICT
);

INSERT INTO public.ai_providers VALUES ('11111111-1111-4111-8111-111111111111', 'Existing provider', 3);
INSERT INTO public.ai_models VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

\ir ../migrations/20260911140000_restrict_ai_provider_model_delete.sql

BEGIN;
DO $$
DECLARE
  deleted_count integer;
  provider_id uuid;
BEGIN
  IF (SELECT count(*) FROM pg_constraint
      WHERE conname IN ('ai_models_provider_id_fkey', 'ai_model_catalog_sync_runs_provider_id_fkey', 'ai_model_catalog_entries_provider_id_fkey')
        AND connamespace = 'public'::regnamespace AND confrelid = 'public.ai_providers'::regclass
        AND confdeltype = 'r' AND convalidated) <> 3 THEN
    RAISE EXCEPTION 'All three provider FKs must be validated RESTRICT constraints';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_models WHERE id = '22222222-2222-4222-8222-222222222222')
    OR to_regclass('public.ai_models_provider_id_idx') IS NULL THEN
    RAISE EXCEPTION 'Migration must preserve existing model and index';
  END IF;

  INSERT INTO public.ai_providers VALUES
    ('33333333-3333-4333-8333-333333333333', 'Unused provider', 3),
    ('44444444-4444-4444-8444-444444444444', 'Run-only provider', 3),
    ('55555555-5555-4555-8555-555555555555', 'Entry-only provider', 3);
  INSERT INTO public.ai_model_catalog_sync_runs VALUES
    ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444');
  -- The entry belongs to the run but references a separate provider to exercise its FK independently.
  INSERT INTO public.ai_model_catalog_entries VALUES
    ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555');

  DELETE FROM public.ai_providers WHERE id = '33333333-3333-4333-8333-333333333333' AND version = 2;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 0 THEN RAISE EXCEPTION 'Stale version must not delete'; END IF;
  DELETE FROM public.ai_providers WHERE id = '33333333-3333-4333-8333-333333333333' AND version = 3;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 THEN RAISE EXCEPTION 'Unused provider must delete'; END IF;
  DELETE FROM public.ai_providers WHERE id = '33333333-3333-4333-8333-333333333333' AND version = 3;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 0 THEN RAISE EXCEPTION 'Repeated delete must match no rows'; END IF;

  FOREACH provider_id IN ARRAY ARRAY[
    '11111111-1111-4111-8111-111111111111'::uuid,
    '44444444-4444-4444-8444-444444444444'::uuid,
    '55555555-5555-4555-8555-555555555555'::uuid
  ] LOOP
    BEGIN
      DELETE FROM public.ai_providers AS provider WHERE provider.id = provider_id AND version = 3;
      RAISE EXCEPTION 'Referenced provider deletion must fail with 23503';
    EXCEPTION WHEN foreign_key_violation THEN
      NULL; -- The expected SQLSTATE is 23503; each failed statement is rolled back.
    END;
  END LOOP;
  IF (SELECT count(*) FROM public.ai_providers) <> 3
    OR (SELECT count(*) FROM public.ai_models) <> 1
    OR (SELECT count(*) FROM public.ai_model_catalog_sync_runs) <> 1
    OR (SELECT count(*) FROM public.ai_model_catalog_entries) <> 1 THEN
    RAISE EXCEPTION 'Blocked deletion must preserve all referencing data';
  END IF;
END;
$$;
ROLLBACK;

-- Optional manual concurrency check, using a new unused fixture provider:
-- Session A: BEGIN; INSERT INTO ai_models VALUES (<new-model-id>, <provider-id>); (leave open)
-- Session B: DELETE FROM ai_providers WHERE id = <provider-id> AND version = 3; (must wait)
-- Session A: COMMIT; Session B must then fail with 23503 and preserve both rows.
-- Reverse order: Session A deletes the provider in an open transaction; Session B inserts its
-- model and waits. After A commits, B must fail with 23503. No orphan or cascade is permitted.
