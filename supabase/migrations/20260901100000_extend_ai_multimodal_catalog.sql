-- Rollback: forward-only. If this migration must be reverted, deploy a reviewed
-- repair migration that disables new OpenRouter catalog commands, exports
-- ai_model_catalog_* and ai_model_price_snapshots for audit, then drops the new
-- route/model columns only after all API callers stop using them.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.ai_providers
  DROP CONSTRAINT IF EXISTS ai_providers_type_check,
  ADD CONSTRAINT ai_providers_type_check CHECK (
    provider_type = ANY (ARRAY['openai_compatible'::text, 'openrouter'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_providers_version_check,
  ADD CONSTRAINT ai_providers_version_check CHECK (version >= 1);

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS input_modalities jsonb NOT NULL DEFAULT '["text"]'::jsonb,
  ADD COLUMN IF NOT EXISTS capability_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS probe_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS probe_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS catalog_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_price_snapshot_id uuid NULL;

ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_version_check,
  ADD CONSTRAINT ai_models_version_check CHECK (version >= 1),
  DROP CONSTRAINT IF EXISTS ai_models_modality_check,
  ADD CONSTRAINT ai_models_modality_check CHECK (
    modality = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_models_input_modalities_check,
  ADD CONSTRAINT ai_models_input_modalities_check CHECK (
    jsonb_typeof(input_modalities) = 'array'
  ),
  DROP CONSTRAINT IF EXISTS ai_models_capability_payload_check,
  ADD CONSTRAINT ai_models_capability_payload_check CHECK (
    jsonb_typeof(capability_payload) = 'object'
  ),
  DROP CONSTRAINT IF EXISTS ai_models_probe_status_check,
  ADD CONSTRAINT ai_models_probe_status_check CHECK (
    probe_status = ANY (ARRAY['unverified'::text, 'eligible'::text, 'ineligible'::text, 'stale'::text])
  );

ALTER TABLE public.ai_scene_routes
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quality_tier text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS max_cost_usd numeric(24, 12) NOT NULL DEFAULT 1.000000000000,
  ADD COLUMN IF NOT EXISTS confirmation_threshold_usd numeric(24, 12) NOT NULL DEFAULT 0.500000000000,
  ADD COLUMN IF NOT EXISTS concurrency_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cost_guard_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cost_guard_reason text NULL,
  ADD COLUMN IF NOT EXISTS cost_guard_at timestamptz NULL;

ALTER TABLE public.ai_scene_routes
  DROP CONSTRAINT IF EXISTS ai_scene_routes_version_check,
  ADD CONSTRAINT ai_scene_routes_version_check CHECK (version >= 1),
  DROP CONSTRAINT IF EXISTS ai_scene_routes_quality_tier_check,
  ADD CONSTRAINT ai_scene_routes_quality_tier_check CHECK (
    quality_tier = ANY (ARRAY['fast'::text, 'balanced'::text, 'quality'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_scene_routes_modality_check,
  ADD CONSTRAINT ai_scene_routes_modality_check CHECK (
    modality = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_scene_routes_cost_check,
  ADD CONSTRAINT ai_scene_routes_cost_check CHECK (
    max_cost_usd > 0 AND confirmation_threshold_usd >= 0
  ),
  DROP CONSTRAINT IF EXISTS ai_scene_routes_concurrency_check,
  ADD CONSTRAINT ai_scene_routes_concurrency_check CHECK (
    concurrency_limit BETWEEN 1 AND 100
  ),
  DROP CONSTRAINT IF EXISTS ai_scene_routes_cost_guard_status_check,
  ADD CONSTRAINT ai_scene_routes_cost_guard_status_check CHECK (
    cost_guard_status = ANY (ARRAY['active'::text, 'paused_overrun'::text])
  );

DROP INDEX IF EXISTS public.uniq_ai_scene_routes_scene;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_scene_routes_scene_quality
ON public.ai_scene_routes(scene_code, quality_tier);

CREATE TABLE IF NOT EXISTS public.ai_model_catalog_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE RESTRICT,
  run_status text NOT NULL DEFAULT 'preview',
  catalog_hash text NOT NULL,
  source_endpoint text NOT NULL,
  model_count integer NOT NULL DEFAULT 0,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  summary_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ai_model_catalog_sync_runs_status_check CHECK (
    run_status = ANY (ARRAY['preview'::text, 'applied'::text, 'failed'::text])
  ),
  CONSTRAINT ai_model_catalog_sync_runs_catalog_hash_check CHECK (
    catalog_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ai_model_catalog_sync_runs_source_endpoint_check CHECK (
    btrim(source_endpoint) <> '' AND char_length(source_endpoint) <= 2048
  ),
  CONSTRAINT ai_model_catalog_sync_runs_model_count_check CHECK (
    model_count BETWEEN 0 AND 10000
  ),
  CONSTRAINT ai_model_catalog_sync_runs_summary_payload_check CHECK (
    jsonb_typeof(summary_payload) = 'object'
  )
);

CREATE TABLE IF NOT EXISTS public.ai_model_catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ai_model_catalog_sync_runs(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE RESTRICT,
  current_model_id uuid NULL REFERENCES public.ai_models(id) ON DELETE SET NULL,
  current_model_version integer NULL,
  external_model_id text NOT NULL,
  model_code text NOT NULL,
  model_name text NOT NULL,
  modality text NOT NULL,
  input_modalities jsonb NOT NULL,
  capability_payload jsonb NOT NULL,
  raw_price_projection jsonb NOT NULL,
  catalog_hash text NOT NULL,
  change_type text NOT NULL,
  entry_position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ai_model_catalog_entries_external_model_check CHECK (
    btrim(external_model_id) <> '' AND char_length(external_model_id) <= 512
  ),
  CONSTRAINT ai_model_catalog_entries_model_code_check CHECK (
    btrim(model_code) <> '' AND char_length(model_code) <= 256
  ),
  CONSTRAINT ai_model_catalog_entries_model_name_check CHECK (
    btrim(model_name) <> '' AND char_length(model_name) <= 512
  ),
  CONSTRAINT ai_model_catalog_entries_modality_check CHECK (
    modality = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text])
  ),
  CONSTRAINT ai_model_catalog_entries_input_modalities_check CHECK (
    jsonb_typeof(input_modalities) = 'array'
  ),
  CONSTRAINT ai_model_catalog_entries_capability_payload_check CHECK (
    jsonb_typeof(capability_payload) = 'object'
  ),
  CONSTRAINT ai_model_catalog_entries_raw_price_projection_check CHECK (
    jsonb_typeof(raw_price_projection) = 'object'
  ),
  CONSTRAINT ai_model_catalog_entries_catalog_hash_check CHECK (
    catalog_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ai_model_catalog_entries_change_type_check CHECK (
    change_type = ANY (ARRAY['new'::text, 'changed'::text, 'removed'::text, 'unchanged'::text])
  ),
  CONSTRAINT ai_model_catalog_entries_current_model_version_check CHECK (
    (current_model_id IS NULL AND current_model_version IS NULL)
    OR (current_model_id IS NOT NULL AND current_model_version IS NOT NULL AND current_model_version >= 1)
  ),
  CONSTRAINT ai_model_catalog_entries_run_position_check CHECK (
    entry_position >= 1 AND entry_position <= 10000
  ),
  UNIQUE (run_id, entry_position),
  UNIQUE (run_id, external_model_id)
);

CREATE TABLE IF NOT EXISTS public.ai_model_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.ai_models(id) ON DELETE RESTRICT,
  catalog_sync_run_id uuid NULL REFERENCES public.ai_model_catalog_sync_runs(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'USD',
  prompt_price_usd numeric(24, 12) NULL,
  completion_price_usd numeric(24, 12) NULL,
  request_price_usd numeric(24, 12) NULL,
  image_price_usd numeric(24, 12) NULL,
  video_price_usd numeric(24, 12) NULL,
  speech_price_usd numeric(24, 12) NULL,
  raw_price_projection jsonb NOT NULL,
  catalog_hash text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ai_model_price_snapshots_currency_check CHECK (currency = 'USD'),
  CONSTRAINT ai_model_price_snapshots_nonnegative_check CHECK (
    (prompt_price_usd IS NULL OR prompt_price_usd >= 0)
    AND (completion_price_usd IS NULL OR completion_price_usd >= 0)
    AND (request_price_usd IS NULL OR request_price_usd >= 0)
    AND (image_price_usd IS NULL OR image_price_usd >= 0)
    AND (video_price_usd IS NULL OR video_price_usd >= 0)
    AND (speech_price_usd IS NULL OR speech_price_usd >= 0)
  ),
  CONSTRAINT ai_model_price_snapshots_raw_price_projection_check CHECK (
    jsonb_typeof(raw_price_projection) = 'object'
  ),
  CONSTRAINT ai_model_price_snapshots_catalog_hash_check CHECK (
    catalog_hash ~ '^[0-9a-f]{64}$'
  )
);

ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_current_price_snapshot_id_fkey,
  ADD CONSTRAINT ai_models_current_price_snapshot_id_fkey
    FOREIGN KEY (current_price_snapshot_id)
    REFERENCES public.ai_model_price_snapshots(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_models_provider_status_idx
ON public.ai_models(provider_id, status, modality, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_models_catalog_managed_provider_model_name
ON public.ai_models(provider_id, model_name)
WHERE catalog_managed;

CREATE INDEX IF NOT EXISTS ai_scene_routes_scene_tier_idx
ON public.ai_scene_routes(scene_code, quality_tier, status);

CREATE INDEX IF NOT EXISTS ai_model_catalog_runs_provider_created_idx
ON public.ai_model_catalog_sync_runs(provider_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ai_model_catalog_entries_run_position_idx
ON public.ai_model_catalog_entries(run_id, entry_position);

CREATE INDEX IF NOT EXISTS ai_model_catalog_entries_run_change_idx
ON public.ai_model_catalog_entries(run_id, change_type, entry_position);

CREATE INDEX IF NOT EXISTS ai_model_price_snapshots_model_valid_idx
ON public.ai_model_price_snapshots(model_id, valid_from DESC, id DESC);

CREATE OR REPLACE FUNCTION public.reject_ai_model_price_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'ai_model_price_snapshots_append_only';
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_ai_model_catalog_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'ai_model_catalog_entries_update_forbidden';
END;
$function$;

DROP TRIGGER IF EXISTS tr_ai_model_price_snapshots_append_only
ON public.ai_model_price_snapshots;
CREATE TRIGGER tr_ai_model_price_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.ai_model_price_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_ai_model_price_snapshot_mutation();

DROP TRIGGER IF EXISTS tr_ai_model_catalog_entries_append_only
ON public.ai_model_catalog_entries;
CREATE TRIGGER tr_ai_model_catalog_entries_append_only
BEFORE UPDATE OR DELETE ON public.ai_model_catalog_entries
FOR EACH ROW EXECUTE FUNCTION public.reject_ai_model_catalog_entry_mutation();

CREATE OR REPLACE FUNCTION public.increment_ai_config_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := GREATEST(COALESCE(OLD.version, 1) + 1, COALESCE(NEW.version, 1));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_ai_providers_version ON public.ai_providers;
CREATE TRIGGER tr_ai_providers_version
BEFORE UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.increment_ai_config_version();

DROP TRIGGER IF EXISTS tr_ai_models_version ON public.ai_models;
CREATE TRIGGER tr_ai_models_version
BEFORE UPDATE ON public.ai_models
FOR EACH ROW EXECUTE FUNCTION public.increment_ai_config_version();

DROP TRIGGER IF EXISTS tr_ai_scene_routes_version ON public.ai_scene_routes;
CREATE TRIGGER tr_ai_scene_routes_version
BEFORE UPDATE ON public.ai_scene_routes
FOR EACH ROW EXECUTE FUNCTION public.increment_ai_config_version();

CREATE OR REPLACE FUNCTION public.ai_catalog_error(
  p_status_code integer,
  p_code text,
  p_message text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'error',
    jsonb_build_object(
      'status_code', p_status_code,
      'code', p_code,
      'message', p_message
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.ai_price_value(
  p_payload jsonb,
  p_key text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_value text;
BEGIN
  v_value := NULLIF(btrim(p_payload ->> p_key), '');
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_value !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ai_model_price_invalid';
  END IF;
  RETURN v_value::numeric(24, 12);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_openrouter_model_catalog_preview(
  p_provider_id uuid,
  p_catalog_hash text,
  p_source_endpoint text,
  p_entries jsonb,
  p_created_by_employee_id uuid DEFAULT NULL,
  p_summary_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_provider public.ai_providers%ROWTYPE;
  v_entry_count integer;
  v_run_id uuid;
  v_expected_keys text[] := ARRAY[
    'capability_payload',
    'catalog_hash',
    'change_type',
    'external_model_id',
    'input_modalities',
    'modality',
    'model_code',
    'model_name',
    'raw_price_projection'
  ];
BEGIN
  IF p_provider_id IS NULL
    OR p_catalog_hash IS NULL
    OR p_catalog_hash !~ '^[0-9a-f]{64}$'
    OR p_source_endpoint IS NULL
    OR btrim(p_source_endpoint) = ''
    OR char_length(p_source_endpoint) > 2048
    OR p_entries IS NULL
    OR jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) > 10000
    OR p_summary_payload IS NULL
    OR jsonb_typeof(p_summary_payload) <> 'object'
  THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_PREVIEW_INVALID', '模型目录预览无效');
  END IF;

  SELECT provider.* INTO v_provider
  FROM public.ai_providers AS provider
  WHERE provider.id = p_provider_id
    AND provider.provider_type = 'openrouter'
    AND provider.status = 'active'
  FOR UPDATE OF provider;

  IF NOT FOUND THEN
    RETURN public.ai_catalog_error(404, 'AI_MODEL_PROVIDER_NOT_FOUND', 'OpenRouter供应商不存在');
  END IF;

  SELECT jsonb_array_length(p_entries) INTO v_entry_count;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entries) AS raw(value)
    WHERE jsonb_typeof(raw.value) <> 'object'
  ) THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_PREVIEW_INVALID', '模型目录条目无效');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entries) AS raw(value)
    WHERE (
      SELECT array_agg(key ORDER BY key)
      FROM jsonb_object_keys(raw.value) AS key
    ) IS DISTINCT FROM v_expected_keys
  ) THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_PREVIEW_INVALID', '模型目录条目字段无效');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entries) AS raw(value)
    WHERE NULLIF(btrim(COALESCE(raw.value ->> 'external_model_id', '')), '') IS NULL
      OR char_length(raw.value ->> 'external_model_id') > 512
      OR NULLIF(btrim(COALESCE(raw.value ->> 'model_code', '')), '') IS NULL
      OR char_length(raw.value ->> 'model_code') > 256
      OR NULLIF(btrim(COALESCE(raw.value ->> 'model_name', '')), '') IS NULL
      OR char_length(raw.value ->> 'model_name') > 512
      OR COALESCE((raw.value ->> 'modality') = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text]), false) IS NOT TRUE
      OR jsonb_typeof(raw.value -> 'input_modalities') IS DISTINCT FROM 'array'
      OR jsonb_typeof(raw.value -> 'capability_payload') IS DISTINCT FROM 'object'
      OR jsonb_typeof(raw.value -> 'raw_price_projection') IS DISTINCT FROM 'object'
      OR (raw.value ->> 'catalog_hash') IS DISTINCT FROM p_catalog_hash
      OR COALESCE((raw.value ->> 'change_type') = ANY (ARRAY['new'::text, 'changed'::text, 'removed'::text, 'unchanged'::text]), false) IS NOT TRUE
  ) THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CATALOG_PREVIEW_INVALID', '模型目录条目无效');
  END IF;

  INSERT INTO public.ai_model_catalog_sync_runs (
    provider_id,
    run_status,
    catalog_hash,
    source_endpoint,
    model_count,
    created_by_employee_id,
    summary_payload
  )
  VALUES (
    v_provider.id,
    'preview',
    p_catalog_hash,
    p_source_endpoint,
    v_entry_count,
    p_created_by_employee_id,
    p_summary_payload
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.ai_model_catalog_entries (
    run_id,
    provider_id,
    current_model_id,
    current_model_version,
    external_model_id,
    model_code,
    model_name,
    modality,
    input_modalities,
    capability_payload,
    raw_price_projection,
    catalog_hash,
    change_type,
    entry_position
  )
  SELECT
    v_run_id,
    v_provider.id,
    current_model.id,
    current_model.version,
    btrim(raw.value ->> 'external_model_id'),
    btrim(raw.value ->> 'model_code'),
    btrim(raw.value ->> 'model_name'),
    raw.value ->> 'modality',
    raw.value -> 'input_modalities',
    raw.value -> 'capability_payload',
    raw.value -> 'raw_price_projection',
    raw.value ->> 'catalog_hash',
    raw.value ->> 'change_type',
    raw.entry_position::integer
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS raw(value, entry_position)
  LEFT JOIN public.ai_models AS current_model
    ON current_model.provider_id = v_provider.id
   AND current_model.model_name = btrim(raw.value ->> 'external_model_id')
   AND current_model.catalog_managed IS TRUE;

  RETURN jsonb_build_object(
    'data',
    jsonb_build_object(
      'run_id', v_run_id,
      'provider_id', v_provider.id,
      'catalog_hash', p_catalog_hash,
      'model_count', v_entry_count
    )
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN public.ai_catalog_error(400, SQLERRM, '模型目录预览数据无效');
  WHEN OTHERS THEN
    RETURN public.ai_catalog_error(500, 'AI_MODEL_CATALOG_PREVIEW_SAVE_FAILED', '模型目录预览保存失败');
END;
$function$;

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
     AND identity_model.catalog_managed IS TRUE
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.current_model_id IS NULL
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
  END IF;

  PERFORM conflict_model.id
  FROM public.ai_model_catalog_entries AS entry
  JOIN (
    SELECT value::uuid AS id
    FROM jsonb_array_elements_text(p_entry_ids)
  ) AS requested ON requested.id = entry.id
  JOIN public.ai_models AS conflict_model
    ON conflict_model.code = entry.model_code
  WHERE entry.run_id = p_run_id
    AND entry.provider_id = v_provider.id
    AND entry.catalog_hash = p_expected_catalog_hash
    AND entry.change_type <> 'removed'
  ORDER BY conflict_model.id
  FOR UPDATE OF conflict_model;

  IF EXISTS (
    WITH requested AS (
      SELECT value::uuid AS id
      FROM jsonb_array_elements_text(p_entry_ids)
    )
    SELECT 1
    FROM public.ai_model_catalog_entries AS entry
    JOIN requested ON requested.id = entry.id
    JOIN public.ai_models AS conflict_model
      ON conflict_model.code = entry.model_code
    WHERE entry.run_id = p_run_id
      AND entry.provider_id = v_provider.id
      AND entry.catalog_hash = p_expected_catalog_hash
      AND entry.change_type <> 'removed'
      AND (
        entry.current_model_id IS NULL
        OR conflict_model.id <> entry.current_model_id
      )
  ) THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_CODE_CONFLICT', '模型编码已被占用');
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
        v_entry.model_code,
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
          code = v_entry.model_code,
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
    IF v_constraint_name = 'uniq_ai_models_catalog_managed_provider_model_name' THEN
      RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
    END IF;
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_CODE_CONFLICT', '模型编码已被占用');
  WHEN OTHERS THEN
    RETURN public.ai_catalog_error(500, 'AI_MODEL_CATALOG_APPLY_FAILED', '模型目录应用失败');
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_ai_model_capability_override(
  p_model_id uuid,
  p_expected_version integer,
  p_capability_payload jsonb,
  p_probe_status text,
  p_probe_at timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_model public.ai_models%ROWTYPE;
  v_updated public.ai_models%ROWTYPE;
BEGIN
  IF p_model_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_capability_payload IS NULL
    OR jsonb_typeof(p_capability_payload) <> 'object'
    OR p_probe_status IS NULL
    OR NOT (p_probe_status = ANY (ARRAY['unverified'::text, 'eligible'::text, 'ineligible'::text, 'stale'::text]))
  THEN
    RETURN public.ai_catalog_error(400, 'AI_MODEL_CAPABILITY_INVALID', '模型能力参数无效');
  END IF;

  SELECT * INTO v_model
  FROM public.ai_models AS model
  WHERE model.id = p_model_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.ai_catalog_error(404, 'AI_MODEL_NOT_FOUND', '模型不存在');
  END IF;

  IF v_model.version <> p_expected_version THEN
    RETURN public.ai_catalog_error(409, 'AI_MODEL_VERSION_STALE', '模型版本已变化');
  END IF;

  UPDATE public.ai_models
  SET capability_payload = p_capability_payload,
      probe_status = p_probe_status,
      probe_at = p_probe_at,
      version = version + 1
  WHERE id = p_model_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'data',
    jsonb_build_object(
      'model_id', v_updated.id,
      'version', v_updated.version,
      'probe_status', v_updated.probe_status
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN public.ai_catalog_error(500, 'AI_MODEL_CAPABILITY_SAVE_FAILED', '模型能力保存失败');
END;
$function$;

ALTER TABLE public.ai_model_catalog_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_catalog_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_catalog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_catalog_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_price_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_model_catalog_sync_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ai_model_catalog_entries FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ai_model_price_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_model_catalog_sync_runs TO service_role;
GRANT SELECT ON TABLE public.ai_model_catalog_entries TO service_role;
GRANT SELECT ON TABLE public.ai_model_price_snapshots TO service_role;

REVOKE ALL ON FUNCTION public.save_openrouter_model_catalog_preview(uuid, text, text, jsonb, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_openrouter_model_catalog_preview(uuid, text, text, jsonb, uuid, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
TO service_role;

REVOKE ALL ON FUNCTION public.save_ai_model_capability_override(uuid, integer, jsonb, text, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_model_capability_override(uuid, integer, jsonb, text, timestamptz)
TO service_role;

REVOKE ALL ON FUNCTION public.ai_catalog_error(integer, text, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_price_value(jsonb, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_ai_model_price_snapshot_mutation()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_ai_model_catalog_entry_mutation()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.increment_ai_config_version()
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.ai_model_catalog_sync_runs IS 'OpenRouter模型目录同步批次，仅保存脱敏摘要';
COMMENT ON TABLE public.ai_model_catalog_entries IS 'OpenRouter模型目录同步条目，最多每批10000条';
COMMENT ON TABLE public.ai_model_price_snapshots IS 'AI模型价格快照，append-only';

COMMIT;
