-- ISOLATED DISPOSABLE PostgreSQL DATABASE ONLY. Never run against an application database.
-- Expected database name: gooes_system_scenes_fixture
-- Run from the repository root with psql -X -v ON_ERROR_STOP=1 --file=...
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
    RAISE EXCEPTION 'Fixture requires an empty disposable database';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
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
  temperature numeric NULL,
  response_format text NULL,
  timeout_ms integer NULL,
  status text NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX uniq_ai_scene_routes_scene_quality
ON public.ai_scene_routes(scene_code, quality_tier);

INSERT INTO public.ai_scene_routes VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'decoration_qa',
    '已有问答路由',
    '21111111-1111-4111-8111-111111111111',
    '31111111-1111-4111-8111-111111111111',
    'balanced',
    'text',
    0.7,
    'text',
    60000,
    'active',
    3,
    '2026-09-01T00:00:00Z',
    '2026-09-01T00:00:00Z'
  ),
  (
    '41111111-1111-4111-8111-111111111111',
    'historical_custom_scene',
    '历史自定义场景',
    '51111111-1111-4111-8111-111111111111',
    NULL,
    'fast',
    'text',
    0.2,
    'json_object',
    20000,
    'inactive',
    7,
    '2026-08-01T00:00:00Z',
    '2026-08-02T00:00:00Z'
  );

\ir ../migrations/20260911151225_create_ai_system_scene_registry.sql

BEGIN;
DO $$
DECLARE
  original_route record;
BEGIN
  IF (SELECT count(*) FROM public.ai_system_scenes WHERE source = 'system') <> 10
    OR (SELECT count(*) FROM public.ai_system_scenes) <> 11 THEN
    RAISE EXCEPTION 'Registry must contain ten system scenes and one legacy scene';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_system_scenes
    WHERE code = 'decoration_raw_drawing'
      AND modality = 'image'
      AND required_input_modalities = ARRAY['text', 'image']::text[]
      AND runtime_status = 'not_connected'
      AND requirements_source = 'planned_adapter'
      AND min_reference_images = 2
      AND source = 'system'
      AND allow_new_configuration
  ) THEN
    RAISE EXCEPTION 'Raw drawing registry contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_system_scenes
    WHERE code = 'historical_custom_scene'
      AND name = '历史自定义场景'
      AND modality = 'text'
      AND source = 'legacy'
      AND NOT allow_new_configuration
  ) THEN
    RAISE EXCEPTION 'Unknown historical scene was not preserved as legacy';
  END IF;

  SELECT * INTO STRICT original_route
  FROM public.ai_scene_routes
  WHERE id = '41111111-1111-4111-8111-111111111111';
  IF original_route.scene_code <> 'historical_custom_scene'
    OR original_route.primary_model_id <> '51111111-1111-4111-8111-111111111111'
    OR original_route.fallback_model_id IS NOT NULL
    OR original_route.version <> 7 THEN
    RAISE EXCEPTION 'Migration rewrote historical route identity or bindings';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
      WHERE conname = 'ai_scene_routes_system_scene_identity_fkey'
        AND convalidated
        AND confrelid = 'public.ai_system_scenes'::regclass) <> 1 THEN
    RAISE EXCEPTION 'Validated route-to-registry reference is missing';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity
          FROM pg_class WHERE oid = 'public.ai_system_scenes'::regclass) THEN
    RAISE EXCEPTION 'Registry RLS must be enabled and forced';
  END IF;
  IF has_table_privilege('authenticated', 'public.ai_system_scenes', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.ai_system_scenes', 'SELECT') THEN
    RAISE EXCEPTION 'Registry table grants are unsafe';
  END IF;

  BEGIN
    UPDATE public.ai_scene_routes
    SET scene_code = 'decoration_qa_title'
    WHERE id = '41111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'Route identity update must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.ai_system_scenes
    SET name = '不可改名'
    WHERE code = 'decoration_qa';
    RAISE EXCEPTION 'Registry update must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_scene_routes VALUES (
      '61111111-1111-4111-8111-111111111111', 'historical_custom_scene', '新增历史路由',
      NULL, NULL, 'quality', 'text', NULL, NULL, NULL, 'inactive', 1,
      clock_timestamp(), clock_timestamp()
    );
    RAISE EXCEPTION 'Legacy scene must reject new route configuration';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.ai_scene_routes VALUES (
      '71111111-1111-4111-8111-111111111111', 'decoration_raw_drawing', '生图路由',
      '81111111-1111-4111-8111-111111111111', NULL, 'balanced', 'image', NULL, NULL, NULL,
      'inactive', 1, clock_timestamp(), clock_timestamp()
    );
    RAISE EXCEPTION 'Disconnected runtime must reject a new model binding';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.ai_scene_routes
  SET primary_model_id = '91111111-1111-4111-8111-111111111111'
  WHERE id = '41111111-1111-4111-8111-111111111111';
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_scene_routes
    WHERE id = '41111111-1111-4111-8111-111111111111'
      AND primary_model_id = '91111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'Legacy route ordinary edits must remain available';
  END IF;
END;
$$;
ROLLBACK;
