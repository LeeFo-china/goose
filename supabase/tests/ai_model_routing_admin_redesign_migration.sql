-- ISOLATED DISPOSABLE PostgreSQL DATABASE ONLY. Never use a development/production database.
-- Expected database: gooes_ai_routing_admin_fixture, on a local disposable PostgreSQL cluster.
-- psql -X -v ON_ERROR_STOP=1 --dbname=gooes_ai_routing_admin_fixture --file=<this-file>
-- Prerequisites intentionally persist; behavior assertions run in a rolled-back transaction.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'gooes_ai_routing_admin_fixture'
    OR (inet_server_addr() IS NOT NULL AND NOT (
      inet_server_addr() <<= '127.0.0.0/8'::inet OR inet_server_addr() = '::1'::inet
    )) THEN
    RAISE EXCEPTION 'Fixture requires local disposable database gooes_ai_routing_admin_fixture';
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

-- Minimal non-AI dependencies only; AI tables/functions come from actual migrations.
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.employees (id uuid PRIMARY KEY);
CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

\ir ../migrations/20260509183000_create_ai_provider_routing.sql
\ir ../migrations/20260901100000_extend_ai_multimodal_catalog.sql
\ir ../migrations/20260904110000_extend_openrouter_catalog_classification.sql
\ir ../migrations/20260911140000_restrict_ai_provider_model_delete.sql
\ir ../migrations/20260911151225_create_ai_system_scene_registry.sql
\ir ../migrations/20260912100000_rework_ai_model_routing_admin.sql

BEGIN;
DO $$
DECLARE
  result jsonb;
  scene_code constant text := 'scene_11111111111141118111111111111111';
  provider_id uuid;
  model_id uuid;
  scene_before public.ai_system_scenes%ROWTYPE;
  column_name text;
  function_signature text;
BEGIN
  IF NOT has_table_privilege('service_role', 'public.ai_system_scenes', 'SELECT')
    OR has_table_privilege('service_role', 'public.ai_system_scenes', 'UPDATE')
    OR has_table_privilege('service_role', 'public.ai_system_scenes', 'INSERT')
    OR has_table_privilege('service_role', 'public.ai_system_scenes', 'DELETE')
    OR NOT has_column_privilege('service_role', 'public.ai_system_scenes', 'name', 'UPDATE')
    OR NOT has_column_privilege('service_role', 'public.ai_system_scenes', 'status', 'UPDATE')
    OR EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.ai_system_scenes'::regclass
        AND attribute.attnum > 0 AND NOT attribute.attisdropped
        AND (
          (attribute.attname NOT IN ('name', 'status')
            AND has_column_privilege('service_role', attribute.attrelid, attribute.attnum, 'UPDATE'))
          OR has_column_privilege('anon', attribute.attrelid, attribute.attnum, 'UPDATE')
          OR has_column_privilege('authenticated', attribute.attrelid, attribute.attnum, 'UPDATE')
        )
    ) THEN
    RAISE EXCEPTION 'Registry must grant only name/status updates to service_role';
  END IF;

  FOREACH function_signature IN ARRAY ARRAY[
    'public.create_ai_custom_scene_route(text,text,text,text,uuid,uuid,numeric,text,integer,text)',
    'public.delete_ai_custom_scene(text,integer)',
    'public.apply_openrouter_model_catalog(uuid,jsonb,text)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE')
      OR has_function_privilege('authenticated', function_signature, 'EXECUTE')
      OR NOT has_function_privilege('service_role', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unsafe RPC privileges: %', function_signature;
    END IF;
  END LOOP;

  -- Run as the actual service role to prove SECURITY DEFINER crosses registry write ACLs.
  SET LOCAL ROLE service_role;
  result := public.create_ai_custom_scene_route(
    scene_code, ' 自定义文案 ', 'text', 'balanced', NULL, NULL, 0.7, 'text', 60000, 'active'
  );
  RESET ROLE;
  IF result #>> '{scene,source}' IS DISTINCT FROM 'custom'
    OR result #>> '{route,scene_code}' IS DISTINCT FROM scene_code
    OR result #>> '{scene,name}' IS DISTINCT FROM '自定义文案'
    OR result #>> '{route,name}' IS DISTINCT FROM '自定义文案'
    OR result #>> '{scene,requirements_source}' IS DISTINCT FROM 'admin'
    OR result #>> '{scene,runtime_status}' IS DISTINCT FROM 'not_connected' THEN
    RAISE EXCEPTION 'Custom scene/route creation contract failed: %', result;
  END IF;

  SELECT * INTO STRICT scene_before FROM public.ai_system_scenes WHERE code = scene_code;
  SET LOCAL ROLE service_role;
  UPDATE public.ai_system_scenes SET name = '新文案', status = 'inactive'
  WHERE code = scene_code AND source = 'custom' AND version = scene_before.version;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_system_scenes
    WHERE code = scene_code AND name = '新文案' AND status = 'inactive'
      AND version = scene_before.version + 1
      AND updated_at > scene_before.updated_at AND updated_at <= clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Custom scene update must increment version exactly once';
  END IF;
  RESET ROLE;

  FOREACH column_name IN ARRAY ARRAY['code', 'modality', 'runtime_status', 'source'] LOOP
    BEGIN
      EXECUTE format('UPDATE public.ai_system_scenes SET %I = %L WHERE code = %L',
        column_name, 'forbidden-change', scene_code);
      RAISE EXCEPTION 'Custom scene identity mutation must fail';
    EXCEPTION WHEN SQLSTATE '23514' THEN
      IF SQLERRM <> 'ai_scene_identity_immutable' THEN RAISE; END IF;
    END;
  END LOOP;

  SET LOCAL ROLE service_role;
  BEGIN
    UPDATE public.ai_system_scenes SET name = '不可改名' WHERE code = 'decoration_qa';
    RAISE EXCEPTION 'System scene mutation must fail';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'ai_system_scene_registry_immutable' THEN RAISE; END IF;
  END;
  RESET ROLE;

  SELECT id INTO STRICT provider_id FROM public.ai_providers WHERE code = 'deepseek';
  SELECT id INTO STRICT model_id FROM public.ai_models WHERE code = 'deepseek-chat';
  IF NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE id = provider_id
    AND endpoint_url = 'https://api.deepseek.com/chat/completions') THEN
    RAISE EXCEPTION 'Existing provider endpoint must remain unchanged';
  END IF;
  BEGIN
    UPDATE public.ai_providers SET code = 'rewritten' WHERE id = provider_id;
    RAISE EXCEPTION 'Provider code mutation must fail';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'ai_config_code_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.ai_models SET code = 'rewritten' WHERE id = model_id;
    RAISE EXCEPTION 'Model code mutation must fail';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'ai_config_code_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.ai_models (provider_id, code, name, model_name, modality)
    VALUES (provider_id, 'duplicate-model', '重复模型', 'deepseek-chat', 'text');
    RAISE EXCEPTION 'Duplicate model business key must fail';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL; -- Only the new business key can conflict: code and generated id are distinct.
  END;

  INSERT INTO public.ai_models (
    provider_id, code, name, model_name, modality, input_modalities, probe_status
  ) VALUES (
    provider_id, 'fixture-image-model', '预配置生图模型', 'fixture/image', 'image',
    '["text","image"]'::jsonb, 'eligible'
  ) RETURNING id INTO model_id;
  INSERT INTO public.ai_scene_routes (scene_code, name, modality, primary_model_id)
  VALUES ('decoration_raw_drawing', '预配置生图', 'image', model_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_scene_routes AS route
    JOIN public.ai_system_scenes AS scene ON scene.code = route.scene_code
    WHERE scene.code = 'decoration_raw_drawing' AND scene.runtime_status = 'not_connected'
      AND route.primary_model_id = model_id
  ) THEN
    RAISE EXCEPTION 'Disconnected scene must accept a valid preconfigured binding';
  END IF;

  BEGIN
    PERFORM public.delete_ai_custom_scene(scene_code, 1);
    RAISE EXCEPTION 'Stale scene version must fail';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    IF SQLERRM <> 'ai_config_version_stale' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.delete_ai_custom_scene(scene_code, 2);
    RAISE EXCEPTION 'Referenced custom scene deletion must fail';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'ai_custom_scene_in_use' THEN RAISE; END IF;
  END;
  DELETE FROM public.ai_scene_routes AS route WHERE route.scene_code = scene_before.code;
  INSERT INTO public.ai_call_logs (scene_code, status) VALUES (scene_code, 'success');
  BEGIN
    PERFORM public.delete_ai_custom_scene(scene_code, 2);
    RAISE EXCEPTION 'Call log reference must prevent custom scene deletion';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'ai_custom_scene_in_use' THEN RAISE; END IF;
  END;
  DELETE FROM public.ai_call_logs AS log WHERE log.scene_code = scene_before.code;
  SET LOCAL ROLE service_role;
  IF public.delete_ai_custom_scene(scene_code, 2) IS DISTINCT FROM scene_code THEN
    RAISE EXCEPTION 'Unused custom scene must be deleted';
  END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.ai_system_scenes WHERE code = scene_code) THEN
    RAISE EXCEPTION 'Deleted custom scene must no longer exist';
  END IF;
END;
$$;

DO $$
DECLARE
  v_provider_id uuid;
  v_run_id uuid;
  entry_ids jsonb;
  result jsonb;
  original_code text;
  catalog_hash text := repeat('a', 64);
  entries jsonb;
  apply_number integer;
BEGIN
  INSERT INTO public.ai_providers (code, name, provider_type, endpoint_url)
  VALUES ('fixture-openrouter', '目录测试', 'openrouter', 'https://openrouter.ai/api/v1')
  RETURNING id INTO v_provider_id;

  FOR apply_number IN 1..2 LOOP
    entries := jsonb_build_array(jsonb_build_object(
      'external_model_id', 'fixture/catalog-model',
      -- First projection deliberately collides with an existing model's code.
      'model_code', CASE WHEN apply_number = 1 THEN 'deepseek-chat' ELSE 'changed-projection' END,
      'model_name', '目录模型 ' || apply_number,
      'modality', 'text', 'input_modalities', jsonb_build_array('text'),
      'capability_payload', '{}'::jsonb,
      'raw_price_projection', jsonb_build_object('prompt', '0.000001'),
      'catalog_hash', catalog_hash,
      'change_type', CASE WHEN apply_number = 1 THEN 'new' ELSE 'changed' END,
      'apply_status', 'eligible', 'apply_block_code', NULL
    ));
    result := public.save_openrouter_model_catalog_preview(
      v_provider_id, catalog_hash, 'https://openrouter.ai/api/v1/models', entries
    );
    IF result ? 'error' OR result #>> '{data,run_id}' IS NULL THEN
      RAISE EXCEPTION 'Catalog preview failed: %', result;
    END IF;
    v_run_id := (result #>> '{data,run_id}')::uuid;
    SELECT jsonb_build_array(entry.id) INTO STRICT entry_ids
    FROM public.ai_model_catalog_entries AS entry WHERE entry.run_id = v_run_id;
    result := public.apply_openrouter_model_catalog(v_run_id, entry_ids, catalog_hash);
    IF result ? 'error' OR result #>> '{data,applied_count}' IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Catalog apply failed: %', result;
    END IF;
    IF apply_number = 1 THEN
      SELECT model.code INTO STRICT original_code FROM public.ai_models AS model
      WHERE model.provider_id = v_provider_id AND model.model_name = 'fixture/catalog-model';
      IF original_code !~ '^mdl_[0-9a-f]{32}$' THEN
        RAISE EXCEPTION 'Catalog-created model must receive an opaque mdl_ code';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.ai_models AS model
        WHERE model.provider_id = v_provider_id AND model.model_name = 'fixture/catalog-model'
          AND model.code = original_code AND model.name = '目录模型 2'
      ) THEN
        RAISE EXCEPTION 'Second catalog apply must preserve model code';
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.ai_model_price_snapshots AS price
      JOIN public.ai_models AS model ON model.id = price.model_id
      WHERE model.code = original_code) <> 2 THEN
    RAISE EXCEPTION 'Catalog apply must retain both price snapshots';
  END IF;
END;
$$;
-- This disposable cluster lacks Supabase's default service-role table grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_models, public.ai_scene_routes TO service_role;
DO $$
DECLARE
  v_provider_id uuid;
  v_model_id uuid;
  v_route_id uuid;
  v_text_route_id uuid;
  v_fallback_model_id uuid;
  v_result jsonb;
  v_constraint text;
  v_slot text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_models'::regclass
    AND conname = 'ai_models_id_modality_key' AND contype = 'u' AND NOT condeferrable) THEN
    RAISE EXCEPTION 'Model identity/modality must have an immediate unique constraint';
  END IF;
  FOREACH v_slot IN ARRAY ARRAY['primary', 'fallback'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint AS fk
      JOIN pg_attribute AS attribute ON attribute.attrelid = fk.conrelid AND attribute.attname = v_slot || '_model_id'
      WHERE fk.conrelid = 'public.ai_scene_routes'::regclass
        AND fk.conname = 'ai_scene_routes_' || v_slot || '_model_modality_fkey'
        AND fk.contype = 'f' AND NOT fk.condeferrable AND fk.convalidated
        AND fk.confrelid = 'public.ai_models'::regclass AND fk.confmatchtype = 's'
        AND fk.confupdtype = 'r' AND fk.confdeltype = 'n'
        AND fk.confdelsetcols = ARRAY[attribute.attnum]) THEN
      RAISE EXCEPTION 'Composite FK must restrict updates and null only the matching model slot';
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.ai_models', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.ai_models', 'UPDATE') THEN
    RAISE EXCEPTION 'Fixture must not grant client roles model mutation rights';
  END IF;
  SELECT id INTO STRICT v_provider_id FROM public.ai_providers WHERE code = 'deepseek';
  SET LOCAL ROLE service_role;
  INSERT INTO public.ai_models (provider_id, code, name, model_name, modality)
  VALUES (v_provider_id, 'fixture-modality-race', '跨表模态约束', 'fixture/modality-race', 'image')
  RETURNING id INTO v_model_id;
  v_result := public.create_ai_custom_scene_route(
    'scene_22222222222242228222222222222222', '复合外键测试', 'image', 'balanced', v_model_id, NULL,
    NULL, NULL, NULL, 'active'
  );
  v_route_id := (v_result #>> '{route,id}')::uuid;
  IF v_route_id IS NULL THEN RAISE EXCEPTION 'Matching route insert must succeed'; END IF;
  BEGIN
    UPDATE public.ai_models SET modality = 'text' WHERE id = v_model_id;
    RAISE EXCEPTION 'Referenced primary model modality mutation must fail';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ai_scene_routes_primary_model_modality_fkey' THEN RAISE; END IF;
  END;
  UPDATE public.ai_models SET name = '可重命名' WHERE id = v_model_id;
  UPDATE public.ai_scene_routes SET primary_model_id = NULL, fallback_model_id = v_model_id WHERE id = v_route_id;
  BEGIN
    UPDATE public.ai_models SET modality = 'text' WHERE id = v_model_id;
    RAISE EXCEPTION 'Referenced fallback model modality mutation must fail';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ai_scene_routes_fallback_model_modality_fkey' THEN RAISE; END IF;
  END;
  UPDATE public.ai_scene_routes SET fallback_model_id = NULL WHERE id = v_route_id;
  UPDATE public.ai_models SET modality = 'text' WHERE id = v_model_id;
  BEGIN
    INSERT INTO public.ai_scene_routes (scene_code, name, modality, quality_tier, primary_model_id)
    VALUES ('scene_22222222222242228222222222222222', '旧模态不能绑定', 'image', 'fast', v_model_id);
    RAISE EXCEPTION 'Route insert after model modality change must fail';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ai_scene_routes_primary_model_modality_fkey' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.ai_scene_routes SET fallback_model_id = v_model_id WHERE id = v_route_id;
    RAISE EXCEPTION 'Route rebind after model modality change must fail';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ai_scene_routes_fallback_model_modality_fkey' THEN RAISE; END IF;
  END;
  INSERT INTO public.ai_models (provider_id, code, name, model_name, modality)
  VALUES (v_provider_id, 'fixture-modality-fallback', '保留备用模型', 'fixture/modality-fallback', 'text')
  RETURNING id INTO v_fallback_model_id;
  v_result := public.create_ai_custom_scene_route(
    'scene_33333333333343338333333333333333', '新模态匹配', 'text', 'balanced', v_model_id, v_fallback_model_id,
    NULL, NULL, NULL, 'active'
  );
  IF v_result #>> '{route,primary_model_id}' IS DISTINCT FROM v_model_id::text THEN
    RAISE EXCEPTION 'Matching route after modality change must succeed';
  END IF;
  v_text_route_id := (v_result #>> '{route,id}')::uuid;
  DELETE FROM public.ai_models WHERE id = v_model_id;
  IF NOT EXISTS (SELECT 1 FROM public.ai_scene_routes WHERE id = v_text_route_id
    AND primary_model_id IS NULL AND fallback_model_id = v_fallback_model_id AND modality = 'text') THEN
    RAISE EXCEPTION 'Model deletion must clear only its primary binding and preserve route modality';
  END IF;
  DELETE FROM public.ai_models WHERE id = v_fallback_model_id;
  IF NOT EXISTS (SELECT 1 FROM public.ai_scene_routes WHERE id = v_text_route_id
    AND primary_model_id IS NULL AND fallback_model_id IS NULL AND modality = 'text') THEN
    RAISE EXCEPTION 'Fallback deletion must clear only its binding and preserve route modality';
  END IF;
  RESET ROLE;
END;
$$;
-- Sequential checks cover both FK directions, binding deletion behavior and ACLs.
-- PostgreSQL's non-deferrable FK enforcement handles transaction interleavings.
ROLLBACK;
