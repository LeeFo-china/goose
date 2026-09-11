-- Negative migration regression: the migration must abort before creating the registry.
-- ISOLATED database gooes_system_scenes_fixture ONLY; cleans its synthetic route table.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'gooes_system_scenes_fixture' THEN
    RAISE EXCEPTION 'Fixture requires database gooes_system_scenes_fixture';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Conflict fixture requires an empty disposable database';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE TABLE public.ai_scene_routes (
  id uuid PRIMARY KEY,
  scene_code text NOT NULL,
  name text NOT NULL,
  primary_model_id uuid NULL,
  fallback_model_id uuid NULL,
  quality_tier text NOT NULL,
  modality text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

INSERT INTO public.ai_scene_routes VALUES
  ('11111111-1111-4111-8111-111111111111', 'historical_conflict', '文本历史路由', NULL, NULL,
   'fast', 'text', clock_timestamp(), clock_timestamp()),
  ('21111111-1111-4111-8111-111111111111', 'historical_conflict', '图片历史路由', NULL, NULL,
   'quality', 'image', clock_timestamp(), clock_timestamp());

-- An expected 23514 error named ai_system_scene_historical_modality_conflict is emitted here.
-- ON_ERROR_STOP is temporarily disabled so the fixture can prove atomic rollback below.
\set ON_ERROR_STOP off
\ir ../migrations/20260911151225_create_ai_system_scene_registry.sql
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.ai_system_scenes') IS NOT NULL THEN
    RAISE EXCEPTION 'Conflicting modalities must prevent registry creation';
  END IF;
  IF (SELECT count(*) FROM public.ai_scene_routes WHERE scene_code = 'historical_conflict') <> 2 THEN
    RAISE EXCEPTION 'Failed migration must preserve all conflicting historical routes';
  END IF;
END;
$$;

DROP TABLE public.ai_scene_routes;
