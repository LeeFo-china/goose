-- Rollback: forward-only. If this migration must be repaired or superseded,
-- deploy a reviewed follow-up migration. Do not revert catalog uniqueness to
-- provider/model_name or run/external_model_id while cross-modality duplicates
-- may exist; first audit and reconcile duplicate identity rows.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.ai_model_catalog_entries
  ADD COLUMN IF NOT EXISTS apply_status text NOT NULL DEFAULT 'eligible',
  ADD COLUMN IF NOT EXISTS apply_block_code text NULL;

ALTER TABLE public.ai_model_catalog_entries
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_apply_status_check,
  ADD CONSTRAINT ai_model_catalog_entries_apply_status_check CHECK (
    apply_status = ANY (ARRAY['eligible'::text, 'blocked'::text])
  ),
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_apply_block_check,
  ADD CONSTRAINT ai_model_catalog_entries_apply_block_check CHECK (
    (
      apply_status = 'eligible'
      AND apply_block_code IS NULL
    )
    OR (
      apply_status = 'blocked'
      AND apply_block_code = 'CAPABILITY_METADATA_INCOMPLETE'
    )
  ),
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_run_id_external_model_id_key,
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_run_model_key,
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_run_model_modality_key,
  ADD CONSTRAINT ai_model_catalog_entries_run_model_modality_key
    UNIQUE (run_id, external_model_id, modality);

DROP INDEX IF EXISTS public.uniq_ai_models_catalog_managed_provider_model_name;
DROP INDEX IF EXISTS public.uniq_ai_models_catalog_managed_provider_model_modality;
CREATE UNIQUE INDEX uniq_ai_models_catalog_managed_provider_model_modality
ON public.ai_models(provider_id, model_name, modality)
WHERE catalog_managed;

DROP INDEX IF EXISTS public.ai_model_catalog_entries_run_modality_change_position_idx;
CREATE INDEX ai_model_catalog_entries_run_modality_change_position_idx
ON public.ai_model_catalog_entries(run_id, modality, change_type, entry_position);

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
    'apply_block_code',
    'apply_status',
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
      OR COALESCE((raw.value ->> 'apply_status') = ANY (ARRAY['eligible'::text, 'blocked'::text]), false) IS NOT TRUE
      OR (
        raw.value ->> 'apply_status' = 'eligible'
        AND raw.value ->> 'apply_block_code' IS NOT NULL
      )
      OR (
        raw.value ->> 'apply_status' = 'blocked'
        AND (raw.value ->> 'apply_block_code') IS DISTINCT FROM 'CAPABILITY_METADATA_INCOMPLETE'
      )
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
    apply_status,
    apply_block_code,
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
    raw.value ->> 'apply_status',
    raw.value ->> 'apply_block_code',
    raw.entry_position::integer
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS raw(value, entry_position)
  LEFT JOIN public.ai_models AS current_model
    ON current_model.provider_id = v_provider.id
   AND current_model.model_name = btrim(raw.value ->> 'external_model_id')
   AND current_model.modality = raw.value ->> 'modality'
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
    IF v_entry.apply_status <> 'eligible' THEN
      RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_ENTRY_BLOCKED', '所选模型能力信息不完整，暂不可应用');
    END IF;

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
    IF v_constraint_name = 'uniq_ai_models_catalog_managed_provider_model_modality' THEN
      RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_MODEL_STALE', '模型配置已变化');
    END IF;
    RETURN public.ai_catalog_error(409, 'AI_MODEL_CATALOG_CODE_CONFLICT', '模型编码已被占用');
  WHEN OTHERS THEN
    RETURN public.ai_catalog_error(500, 'AI_MODEL_CATALOG_APPLY_FAILED', '模型目录应用失败');
END;
$function$;

REVOKE ALL ON FUNCTION public.save_openrouter_model_catalog_preview(uuid, text, text, jsonb, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_openrouter_model_catalog_preview(uuid, text, text, jsonb, uuid, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_openrouter_model_catalog(uuid, jsonb, text)
TO service_role;

COMMIT;
