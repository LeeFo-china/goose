BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.ai_system_scenes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE public.ai_system_scenes
  DROP CONSTRAINT IF EXISTS ai_system_scenes_source_check,
  ADD CONSTRAINT ai_system_scenes_source_check CHECK (
    source = ANY (ARRAY['system'::text, 'custom'::text, 'legacy'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_system_scenes_requirements_source_check,
  ADD CONSTRAINT ai_system_scenes_requirements_source_check CHECK (
    requirements_source = ANY (ARRAY['runtime'::text, 'planned_adapter'::text, 'admin'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_system_scenes_configuration_source_check,
  ADD CONSTRAINT ai_system_scenes_configuration_source_check CHECK (
    (source IN ('system', 'custom') AND allow_new_configuration)
    OR (source = 'legacy' AND NOT allow_new_configuration)
  ),
  DROP CONSTRAINT IF EXISTS ai_system_scenes_status_check,
  ADD CONSTRAINT ai_system_scenes_status_check CHECK (status IN ('active', 'inactive')),
  DROP CONSTRAINT IF EXISTS ai_system_scenes_version_check,
  ADD CONSTRAINT ai_system_scenes_version_check CHECK (version > 0);

-- Block concurrent model writes between duplicate detection and constraint creation.
LOCK TABLE public.ai_models IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  conflicting_key record;
BEGIN
  SELECT provider_id, model_name, modality INTO conflicting_key
  FROM public.ai_models
  GROUP BY provider_id, model_name, modality
  HAVING count(*) > 1
  ORDER BY provider_id, model_name, modality
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'ai_model_business_key_conflict',
      DETAIL = format('(%s, %s, %s)', conflicting_key.provider_id, conflicting_key.model_name, conflicting_key.modality);
  END IF;
END;
$$;

ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_provider_call_name_modality_key,
  ADD CONSTRAINT ai_models_provider_call_name_modality_key
    UNIQUE (provider_id, model_name, modality);

DROP TRIGGER IF EXISTS tr_ai_system_scene_registry_immutable ON public.ai_system_scenes;
DROP FUNCTION IF EXISTS public.ai_system_scene_registry_immutable();

CREATE OR REPLACE FUNCTION public.ai_system_scene_registry_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.source <> 'custom' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_system_scene_registry_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
    OR NEW.modality IS DISTINCT FROM OLD.modality
    OR NEW.required_input_modalities IS DISTINCT FROM OLD.required_input_modalities
    OR NEW.runtime_status IS DISTINCT FROM OLD.runtime_status
    OR NEW.requirements_source IS DISTINCT FROM OLD.requirements_source
    OR NEW.requires_streaming IS DISTINCT FROM OLD.requires_streaming
    OR NEW.min_reference_images IS DISTINCT FROM OLD.min_reference_images
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.allow_new_configuration IS DISTINCT FROM OLD.allow_new_configuration
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_identity_immutable';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_ai_system_scene_registry_guard ON public.ai_system_scenes;
CREATE TRIGGER tr_ai_system_scene_registry_guard
BEFORE UPDATE OR DELETE ON public.ai_system_scenes
FOR EACH ROW EXECUTE FUNCTION public.ai_system_scene_registry_guard();

CREATE OR REPLACE FUNCTION public.ai_config_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_config_code_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_ai_providers_code_immutable ON public.ai_providers;
CREATE TRIGGER tr_ai_providers_code_immutable
BEFORE UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.ai_config_code_immutable();

DROP TRIGGER IF EXISTS tr_ai_models_code_immutable ON public.ai_models;
CREATE TRIGGER tr_ai_models_code_immutable
BEFORE UPDATE ON public.ai_models
FOR EACH ROW EXECUTE FUNCTION public.ai_config_code_immutable();

-- PostgreSQL >= 15 supports SET NULL column subsets; this project targets PG17.
-- Keep the original single-column FKs for existing PostgREST relationship hints.
-- Block writes only during migration preflight/constraint installation.
LOCK TABLE public.ai_scene_routes IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  conflicting_route_id uuid;
BEGIN
  SELECT route.id INTO conflicting_route_id
  FROM public.ai_scene_routes AS route
  LEFT JOIN public.ai_models AS primary_model ON primary_model.id = route.primary_model_id
  LEFT JOIN public.ai_models AS fallback_model ON fallback_model.id = route.fallback_model_id
  WHERE (route.primary_model_id IS NOT NULL AND primary_model.modality IS DISTINCT FROM route.modality)
    OR (route.fallback_model_id IS NOT NULL AND fallback_model.modality IS DISTINCT FROM route.modality)
  ORDER BY route.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_route_model_modality_mismatch';
  END IF;
END;
$$;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_id_modality_key UNIQUE (id, modality) NOT DEFERRABLE;
ALTER TABLE public.ai_scene_routes
  ADD CONSTRAINT ai_scene_routes_primary_model_modality_fkey
    FOREIGN KEY (primary_model_id, modality) REFERENCES public.ai_models(id, modality)
    MATCH SIMPLE ON UPDATE RESTRICT ON DELETE SET NULL (primary_model_id) NOT DEFERRABLE,
  ADD CONSTRAINT ai_scene_routes_fallback_model_modality_fkey
    FOREIGN KEY (fallback_model_id, modality) REFERENCES public.ai_models(id, modality)
    MATCH SIMPLE ON UPDATE RESTRICT ON DELETE SET NULL (fallback_model_id) NOT DEFERRABLE;

-- FK checks and API reference prechecks can stop at the first indexed reference.
CREATE INDEX IF NOT EXISTS idx_ai_scene_routes_primary_model
ON public.ai_scene_routes(primary_model_id) WHERE primary_model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_scene_routes_fallback_model
ON public.ai_scene_routes(fallback_model_id) WHERE fallback_model_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ai_scene_route_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scene public.ai_system_scenes%ROWTYPE;
BEGIN
  SELECT * INTO scene
  FROM public.ai_system_scenes
  WHERE code = NEW.scene_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ai_scene_not_registered';
  END IF;
  IF TG_OP = 'INSERT' AND NOT scene.allow_new_configuration THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_new_configuration_forbidden';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.scene_code IS DISTINCT FROM OLD.scene_code
      OR NEW.modality IS DISTINCT FROM OLD.modality THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_identity_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_ai_custom_scene_route(
  p_scene_code text,
  p_scene_name text,
  p_modality text,
  p_quality_tier text,
  p_primary_model_id uuid,
  p_fallback_model_id uuid,
  p_temperature numeric,
  p_response_format text,
  p_timeout_ms integer,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scene_row public.ai_system_scenes%ROWTYPE;
  route_row public.ai_scene_routes%ROWTYPE;
BEGIN
  IF p_scene_code IS NULL OR p_scene_code !~ '^scene_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_custom_scene_code_invalid';
  END IF;

  INSERT INTO public.ai_system_scenes (
    code, name, modality, required_input_modalities, runtime_status,
    requirements_source, requires_streaming, min_reference_images, source,
    allow_new_configuration, status
  ) VALUES (
    p_scene_code, btrim(p_scene_name), p_modality, ARRAY[p_modality], 'not_connected',
    'admin', false, 0, 'custom', true, 'active'
  ) RETURNING * INTO scene_row;

  INSERT INTO public.ai_scene_routes (
    scene_code, name, modality, quality_tier, primary_model_id, fallback_model_id,
    temperature, response_format, timeout_ms, status
  ) VALUES (
    p_scene_code, scene_row.name, p_modality, p_quality_tier, p_primary_model_id,
    p_fallback_model_id, p_temperature, p_response_format, p_timeout_ms, p_status
  ) RETURNING * INTO route_row;

  RETURN jsonb_build_object('scene', to_jsonb(scene_row), 'route', to_jsonb(route_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_ai_custom_scene(
  p_scene_code text,
  p_expected_version integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scene_row public.ai_system_scenes%ROWTYPE;
BEGIN
  -- Logs have no scene FK. Serialize reference writes before locking the scene.
  LOCK TABLE public.ai_scene_routes, public.ai_call_logs IN SHARE MODE;
  SELECT * INTO scene_row
  FROM public.ai_system_scenes
  WHERE code = p_scene_code
  FOR UPDATE;
  IF NOT FOUND OR scene_row.source <> 'custom' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ai_custom_scene_not_found';
  END IF;
  IF scene_row.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'ai_config_version_stale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_scene_routes WHERE scene_code = p_scene_code)
    OR EXISTS (SELECT 1 FROM public.ai_call_logs WHERE scene_code = p_scene_code) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ai_custom_scene_in_use';
  END IF;
  DELETE FROM public.ai_system_scenes WHERE code = p_scene_code;
  RETURN scene_row.code;
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_system_scene_registry_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_config_code_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_scene_route_identity_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Keep SELECT from the registry migration; the guard owns identity and version changes.
GRANT UPDATE (name, status) ON TABLE public.ai_system_scenes TO service_role;

REVOKE ALL ON FUNCTION public.create_ai_custom_scene_route(text, text, text, text, uuid, uuid, numeric, text, integer, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_custom_scene_route(text, text, text, text, uuid, uuid, numeric, text, integer, text)
TO service_role;

REVOKE ALL ON FUNCTION public.delete_ai_custom_scene(text, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_custom_scene(text, integer)
TO service_role;

-- Catalog model_code remains an external preview/hash projection, not ai_models identity.
CREATE OR REPLACE FUNCTION public.apply_openrouter_model_catalog(
  p_run_id uuid,
  p_entry_ids jsonb,
  p_expected_catalog_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_run public.ai_model_catalog_sync_runs%ROWTYPE;
  v_provider public.ai_providers%ROWTYPE;
  v_entry public.ai_model_catalog_entries%ROWTYPE;
  v_model_id uuid;
  v_model_code text;
  v_price_id uuid;
  v_count integer;
  v_distinct_count integer;
  v_selected_count integer;
  v_applied_count integer := 0;
  v_constraint_name text;
BEGIN
  IF p_run_id IS NULL
    OR p_entry_ids IS NULL
    OR jsonb_typeof(p_entry_ids) <> 'array'
    OR jsonb_array_length(p_entry_ids) < 1
    OR jsonb_array_length(p_entry_ids) > 100
    OR p_expected_catalog_hash IS NULL
    OR p_expected_catalog_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_INVALID', '模型目录请求无效');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_entry_ids) AS requested(value)
    WHERE value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_INVALID', '模型目录条目ID无效');
  END IF;

  WITH requested AS (
    SELECT value::uuid AS id
    FROM jsonb_array_elements_text(p_entry_ids)
  )
  SELECT count(*), count(DISTINCT id)
  INTO v_count, v_distinct_count
  FROM requested;

  IF v_count <> v_distinct_count THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_INVALID', '模型目录条目重复');
  END IF;

  SELECT * INTO v_run
  FROM public.ai_model_catalog_sync_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.ai_catalog_error(404, 'AI_MODEL_CATALOG_RUN_NOT_FOUND', '模型目录同步记录不存在');
  END IF;

  IF v_run.catalog_hash <> p_expected_catalog_hash THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_HASH_STALE', '模型目录版本已变化');
  END IF;

  IF v_run.run_status <> 'preview' THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_RUN_NOT_PREVIEW', '模型目录已处理');
  END IF;

  SELECT provider.* INTO v_provider
  FROM public.ai_providers AS provider
  WHERE provider.id = v_run.provider_id
    AND provider.provider_type = 'openrouter'
  FOR UPDATE OF provider;

  IF NOT FOUND THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_PROVIDER_INVALID', 'OpenRouter供应商不可用');
  END IF;

  WITH requested AS (
    SELECT value::uuid AS id
    FROM jsonb_array_elements_text(p_entry_ids)
  )
  SELECT count(*)
  INTO v_selected_count
  FROM public.ai_model_catalog_entries AS entry
  JOIN requested ON requested.id = entry.id
  WHERE entry.run_id = p_run_id
    AND entry.provider_id = v_provider.id
    AND entry.catalog_hash = p_expected_catalog_hash;

  IF v_selected_count <> v_count THEN
    RETURN public.ai_catalog_error(404, 'AI_MODEL_CATALOG_ENTRY_NOT_FOUND', '模型目录条目不存在');
  END IF;

  PERFORM current_model.id
  FROM public.ai_model_catalog_entries AS entry
  JOIN (
    SELECT value::uuid AS id
    FROM jsonb_array_elements_text(p_entry_ids)
  ) AS requested ON requested.id = entry.id
  JOIN public.ai_models AS current_model
    ON current_model.id = entry.current_model_id
  WHERE entry.run_id = p_run_id
    AND entry.provider_id = v_provider.id
    AND entry.catalog_hash = p_expected_catalog_hash
  ORDER BY current_model.id
  FOR UPDATE OF current_model;

  IF EXISTS (
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT 1
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    LEFT JOIN public.ai_models AS current_model
      ON current_model.id = entry.current_model_id
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.current_model_id IS NOT NULL
      AND (
        current_model.id IS NULL
        OR current_model.provider_id <> v_provider.id
        OR current_model.version <> entry.current_model_version
        OR current_model.modality <> entry.modality
      )
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
  END IF;

  IF EXISTS (
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT 1
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    JOIN public.ai_models AS identity_model
      ON identity_model.provider_id = v_provider.id
     AND identity_model.model_name = entry.external_model_id
     AND identity_model.modality = entry.modality
     AND identity_model.catalog_managed IS TRUE
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.current_model_id IS NULL
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
  END IF;

  IF EXISTS (
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT 1
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.apply_status <> 'eligible'
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_ENTRY_BLOCKED', '所选模型能力信息不完整，暂不可应用');
  END IF;

  IF EXISTS (
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT 1
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.change_type = 'removed' AND entry.current_model_id IS NULL
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
  END IF;

  FOR v_entry IN
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT entry.*
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
    ORDER BY entry.entry_position
    FOR UPDATE OF entry
  LOOP
    IF v_entry.change_type = 'removed' THEN
      UPDATE public.ai_models
      SET status = 'inactive',
          probe_status = 'stale'
      WHERE id = v_entry.current_model_id
        AND provider_id = v_provider.id;
      v_applied_count := v_applied_count + 1;
      CONTINUE;
    END IF;

    IF v_entry.current_model_id IS NULL THEN
      v_model_code := 'mdl_' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO public.ai_models (
        provider_id,
        code,
        name,
        model_name,
        status,
        sort_order,
        modality,
        input_modalities,
        capability_payload,
        probe_status,
        catalog_managed
      )
      VALUES (
        v_provider.id,
        v_model_code,
        v_entry.model_name,
        v_entry.external_model_id,
        'active',
        v_entry.entry_position,
        v_entry.modality,
        v_entry.input_modalities,
        v_entry.capability_payload,
        'stale',
        true
      )
      RETURNING id INTO v_model_id;
    ELSE
      UPDATE public.ai_models
      SET provider_id = v_provider.id,
          name = v_entry.model_name,
          model_name = v_entry.external_model_id,
          status = 'active',
          sort_order = v_entry.entry_position,
          modality = v_entry.modality,
          input_modalities = v_entry.input_modalities,
          capability_payload = v_entry.capability_payload,
          probe_status = 'stale',
          catalog_managed = true
      WHERE id = v_entry.current_model_id
        AND provider_id = v_provider.id
        AND version = v_entry.current_model_version
      RETURNING id INTO v_model_id;
    END IF;

    INSERT INTO public.ai_model_price_snapshots (
      model_id,
      catalog_sync_run_id,
      prompt_price_usd,
      completion_price_usd,
      request_price_usd,
      image_price_usd,
      video_price_usd,
      speech_price_usd,
      raw_price_projection,
      catalog_hash
    )
    VALUES (
      v_model_id,
      v_run.id,
      public.ai_price_value(v_entry.raw_price_projection, 'prompt'),
      public.ai_price_value(v_entry.raw_price_projection, 'completion'),
      public.ai_price_value(v_entry.raw_price_projection, 'request'),
      public.ai_price_value(v_entry.raw_price_projection, 'image'),
      public.ai_price_value(v_entry.raw_price_projection, 'video'),
      public.ai_price_value(v_entry.raw_price_projection, 'speech'),
      v_entry.raw_price_projection,
      v_entry.catalog_hash
    )
    RETURNING id INTO v_price_id;

    UPDATE public.ai_models
    SET current_price_snapshot_id = v_price_id
    WHERE id = v_model_id;

    v_applied_count := v_applied_count + 1;
  END LOOP;

  IF v_applied_count <> v_count THEN
    RETURN public.ai_catalog_error(404, 'AI_MODEL_CATALOG_ENTRY_NOT_FOUND', '模型目录条目不存在');
  END IF;

  UPDATE public.ai_model_catalog_sync_runs
  SET run_status = 'applied'
  WHERE id = v_run.id;

  RETURN jsonb_build_object(
    'data',
    jsonb_build_object(
      'run_id', v_run.id,
      'applied_count', v_applied_count,
      'catalog_hash', v_run.catalog_hash
    )
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN public.ai_catalog_error(400, SQLERRM, '模型目录数据无效');
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'uniq_ai_models_catalog_managed_provider_model_modality' THEN
      RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
    END IF;
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_CODE_CONFLICT', '模型编码已被占用');
  WHEN OTHERS THEN
    RETURN public.ai_catalog_error(500, 'AI_MODEL_CATALOG_APPLY_FAILED', '模型目录应用失败');
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
TO service_role;

-- Rollback: roll back the application and retain this additive schema and identities.
-- Any later schema removal requires a separately reviewed migration after caller migration.
COMMIT;
