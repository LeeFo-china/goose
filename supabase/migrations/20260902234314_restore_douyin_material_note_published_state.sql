-- Restore a mistakenly withdrawn Douyin material note in the shared
-- development environment.
--
-- Scope:
-- - dev-only, guarded by WECHAT_MINIPROGRAM_ENV_VERSION=develop;
-- - title must be exactly 家庭排水系统设计与施工指南;
-- - current note status must be withdrawn;
-- - the previous published_version_id/published_at pair must still exist.
--
-- Production behavior: strict no-op because production is not marked develop.
--
-- Rollback: in development, use the Admin "永久撤回资料" action again with a
-- clear reason if the restored note must be withdrawn after validation.
DO $restore$
DECLARE
  v_is_develop boolean;
  v_candidate_count integer;
  v_note record;
  v_actor_employee_id uuid;
  v_now timestamptz;
  v_result jsonb;
  v_idempotency_key uuid := '20260902-2343-4000-8000-000000000001'::uuid;
  v_reason text :=
    'DEV_DATA_FIX: restore mistakenly withdrawn material note 家庭排水系统设计与施工指南 to its previous published version.';
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings AS setting
    WHERE setting.tenant_id IS NULL
      AND setting.key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND setting.status = 'active'
      AND lower(pg_catalog.btrim(setting.value_text)) = 'develop'
  ) INTO v_is_develop;

  IF NOT v_is_develop THEN
    RETURN;
  END IF;

  WITH candidates AS (
    SELECT note.id
    FROM public.douyin_material_notes AS note
    JOIN public.douyin_material_note_versions AS latest_version
      ON latest_version.note_id = note.id
      AND latest_version.tenant_id = note.tenant_id
      AND latest_version.version_no = (
        SELECT max(version.version_no)
        FROM public.douyin_material_note_versions AS version
        WHERE version.note_id = note.id
          AND version.tenant_id = note.tenant_id
      )
    WHERE note.status = 'withdrawn'
      AND note.published_version_id IS NOT NULL
      AND note.published_at IS NOT NULL
      AND latest_version.title = '家庭排水系统设计与施工指南'
  )
  SELECT count(*) INTO v_candidate_count FROM candidates;

  IF v_candidate_count = 0 THEN
    RETURN;
  END IF;

  IF v_candidate_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MATERIAL_NOTE_RESTORE_AMBIGUOUS';
  END IF;

  SELECT note.*
  INTO v_note
  FROM public.douyin_material_notes AS note
  JOIN public.douyin_material_note_versions AS latest_version
    ON latest_version.note_id = note.id
    AND latest_version.tenant_id = note.tenant_id
    AND latest_version.version_no = (
      SELECT max(version.version_no)
      FROM public.douyin_material_note_versions AS version
      WHERE version.note_id = note.id
        AND version.tenant_id = note.tenant_id
    )
  WHERE note.status = 'withdrawn'
    AND note.published_version_id IS NOT NULL
    AND note.published_at IS NOT NULL
    AND latest_version.title = '家庭排水系统设计与施工指南'
  FOR UPDATE;

  v_actor_employee_id := v_note.updated_by;
  v_now := clock_timestamp();

  UPDATE public.douyin_material_notes AS note
  SET status = 'published',
    updated_by = v_actor_employee_id,
    updated_at = v_now
  WHERE note.id = v_note.id
    AND note.tenant_id = v_note.tenant_id
  RETURNING jsonb_build_object(
    'note_id', note.id,
    'status', note.status,
    'published_version_id', note.published_version_id,
    'published_at', note.published_at
  ) INTO v_result;

  INSERT INTO public.douyin_material_note_command_events (
    tenant_id,
    idempotency_key,
    note_id,
    command,
    request_digest,
    reason,
    result,
    created_by,
    created_at
  ) VALUES (
    v_note.tenant_id,
    v_idempotency_key,
    v_note.id,
    'publish',
    encode(extensions.digest(convert_to(jsonb_build_object(
      'tenant_id', v_note.tenant_id,
      'note_id', v_note.id,
      'operation', 'dev_restore_withdrawn_material_note',
      'target_version_id', v_note.published_version_id,
      'reason', v_reason,
      'idempotency_key', v_idempotency_key
    )::text, 'UTF8'), 'sha256'), 'hex'),
    v_reason,
    v_result,
    v_actor_employee_id,
    v_now
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
END;
$restore$;
