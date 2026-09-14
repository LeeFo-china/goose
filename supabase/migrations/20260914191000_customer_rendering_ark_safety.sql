-- Replace customer rendering COS CI gates with Ark's accepted generation response.
-- Apply with admission and both customer workers disabled. Keep historic review evidence.
-- Rollback: disable admission/worker; use a forward migration after reconciling uncertain jobs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.customer_rendering_inputs
  DROP CONSTRAINT customer_rendering_inputs_status_check,
  ADD CONSTRAINT customer_rendering_inputs_status_check CHECK
    (status IN ('issued', 'processing', 'pending_review', 'approved', 'ready', 'rejected', 'failed', 'deleted'));
ALTER TABLE public.customer_rendering_inputs
  DROP CONSTRAINT customer_rendering_inputs_normalized_check,
  ADD CONSTRAINT customer_rendering_inputs_normalized_check CHECK (
    status NOT IN ('pending_review', 'approved', 'ready')
    OR (normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL
      AND width IS NOT NULL AND height IS NOT NULL AND checksum IS NOT NULL)
  );
ALTER TABLE public.customer_rendering_inputs
  DROP CONSTRAINT customer_rendering_inputs_review_state_check,
  ADD CONSTRAINT customer_rendering_inputs_review_state_check CHECK (
    (status = 'ready' AND review_due_at IS NULL AND (
      (review_decision IS NULL AND reviewed_at IS NULL)
      OR (review_decision IN ('approved', 'manual') AND reviewed_at IS NOT NULL)
    ))
    OR (status = 'approved' AND review_decision = 'approved' AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND review_decision = 'rejected' AND reviewed_at IS NOT NULL)
    OR (status = 'pending_review' AND (
      (review_decision IS NULL AND review_due_at IS NOT NULL AND reviewed_at IS NULL)
      OR (review_decision = 'manual' AND review_due_at IS NULL AND reviewed_at IS NOT NULL)
    ))
    OR (status NOT IN ('ready', 'approved', 'rejected', 'pending_review')
      AND review_decision IS NULL AND reviewed_at IS NULL)
  );
-- Historical manual decisions remain visible in review_decision/reviewed_at but are
-- no longer an admission gate. Previously rejected images are not promoted.
UPDATE public.customer_rendering_inputs
SET status = 'ready', review_due_at = NULL
WHERE status IN ('pending_review', 'approved')
  AND normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL
  AND width IS NOT NULL AND height IS NOT NULL AND checksum IS NOT NULL;
DROP INDEX public.customer_rendering_inputs_review_due_idx;

ALTER TABLE public.customer_rendering_jobs
  DROP CONSTRAINT customer_rendering_jobs_success_review_check,
  ADD CONSTRAINT customer_rendering_jobs_success_review_check CHECK (
    status <> 'succeeded' OR (provider_state = 'response_received'
      AND attempt_id IS NOT NULL AND result_bucket IS NOT NULL
      AND result_region IS NOT NULL AND result_object_key IS NOT NULL
      AND result_sha256 IS NOT NULL AND result_size_bytes IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.create_customer_rendering_job(
  p_tenant_id uuid, p_channel text, p_subject_key_version smallint, p_subject_digest text,
  p_application_id text, p_installation_id uuid, p_phone_key_version smallint,
  p_phone_digest text, p_style_asset_id uuid, p_room_file_id uuid,
  p_floor_plan_file_id uuid, p_space text, p_mode text, p_keep_notes text,
  p_idempotency_key uuid, p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_settings public.tenant_customer_rendering_settings%ROWTYPE;
  v_existing public.customer_rendering_jobs%ROWTYPE;
  v_style public.tenant_rendering_styles%ROWTYPE;
  v_style_file public.platform_file_objects%ROWTYPE;
  v_job_id uuid;
  v_quota jsonb;
  v_day date;
  v_count bigint;
  v_spent bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_subject_key_version IS NULL OR p_subject_key_version <= 0
    OR p_subject_digest IS NULL OR p_subject_digest !~ '^[0-9a-f]{64}$' OR p_idempotency_key IS NULL
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' OR p_style_asset_id IS NULL OR p_room_file_id IS NULL
    OR p_space IS NULL OR p_space NOT IN ('living_room', 'bedroom')
    OR p_mode IS NULL OR p_mode NOT IN ('soft_furnishing', 'renovation')
    OR char_length(coalesce(p_keep_notes, '')) > 300
    OR p_channel IS NULL
    OR NOT ((p_channel = 'wechat' AND p_application_id IS NULL AND p_installation_id IS NULL)
      OR (p_channel = 'douyin' AND p_application_id IS NOT NULL AND p_installation_id IS NOT NULL))
  THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;

  -- This row lock serializes both same-key retries and all tenant budget admission.
  SELECT * INTO v_settings FROM public.tenant_customer_rendering_settings
  WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'disabled'); END IF;

  SELECT * INTO v_existing FROM public.customer_rendering_jobs
  WHERE tenant_id = p_tenant_id AND channel = p_channel
    AND subject_key_version = p_subject_key_version AND subject_digest = p_subject_digest
    AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('decision', 'existing', 'job_id', v_existing.id,
      'status', v_existing.status, 'quota', public.customer_rendering_quota_snapshot(
        p_tenant_id, (SELECT quota_account_id FROM public.customer_rendering_quota_reservations
          WHERE tenant_id = p_tenant_id AND job_id = v_existing.id LIMIT 1)));
  END IF;

  IF NOT v_settings.enabled OR v_settings.daily_task_limit IS NULL
    OR v_settings.daily_budget_fen IS NULL OR v_settings.per_job_reserve_fen IS NULL
  THEN RETURN jsonb_build_object('decision', 'disabled'); END IF;

  SELECT style.* INTO v_style FROM public.tenant_rendering_styles AS style
  WHERE style.tenant_id = p_tenant_id AND style.id = p_style_asset_id
    AND style.status = 'published' AND style.deleted_at IS NULL
    AND style.published_space = p_space AND style.published_file_id IS NOT NULL
    AND style.published_version IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'style_unavailable'); END IF;
  SELECT file.* INTO v_style_file FROM public.platform_file_objects AS file
  WHERE file.tenant_id = p_tenant_id AND file.id = v_style.published_file_id
    AND file.status = 'active' AND file.deleted_at IS NULL
    AND file.visibility = 'public' AND file.scene = 'rendering_style_public'
    AND file.provider = 'tencent_cos' AND file.mime_type = 'image/webp'
    AND file.public_url IS NOT NULL AND file.checksum ~ '^[0-9a-f]{64}$'
    AND file.bucket <> '' AND file.region IS NOT NULL AND file.object_key <> '' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'style_unavailable'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customer_rendering_inputs AS input
    WHERE input.tenant_id = p_tenant_id AND input.id = p_room_file_id
      AND input.channel = p_channel AND input.subject_key_version = p_subject_key_version
      AND input.subject_digest = p_subject_digest
      AND input.application_id IS NOT DISTINCT FROM p_application_id
      AND input.installation_id IS NOT DISTINCT FROM p_installation_id
      AND input.purpose = 'room' AND input.status = 'ready'
      AND input.normalized_object_key IS NOT NULL AND input.normalized_size_bytes IS NOT NULL
      AND input.width IS NOT NULL AND input.height IS NOT NULL AND input.checksum IS NOT NULL
    FOR SHARE OF input
  ) OR (p_floor_plan_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customer_rendering_inputs AS input
    WHERE input.tenant_id = p_tenant_id AND input.id = p_floor_plan_file_id
      AND input.channel = p_channel AND input.subject_key_version = p_subject_key_version
      AND input.subject_digest = p_subject_digest
      AND input.application_id IS NOT DISTINCT FROM p_application_id
      AND input.installation_id IS NOT DISTINCT FROM p_installation_id
      AND input.purpose = 'floor_plan' AND input.status = 'ready'
      AND input.normalized_object_key IS NOT NULL AND input.normalized_size_bytes IS NOT NULL
      AND input.width IS NOT NULL AND input.height IS NOT NULL AND input.checksum IS NOT NULL
    FOR SHARE OF input
  )) THEN RETURN jsonb_build_object('decision', 'input_unavailable'); END IF;

  -- Use wall-clock time after tenant locking; a queued request may cross midnight.
  v_day := (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date;
  SELECT count(*), coalesce(sum(coalesce(actual_cost_fen, reserved_cost_fen)), 0)
    INTO v_count, v_spent FROM public.customer_rendering_jobs
    WHERE tenant_id = p_tenant_id AND budget_date = v_day;
  IF v_count >= v_settings.daily_task_limit THEN
    RETURN jsonb_build_object('decision', 'daily_task_limit');
  END IF;
  IF v_spent + v_settings.per_job_reserve_fen > v_settings.daily_budget_fen THEN
    RETURN jsonb_build_object('decision', 'daily_budget_limit');
  END IF;

  v_job_id := gen_random_uuid();
  v_quota := public.reserve_customer_rendering_quota(p_tenant_id, p_channel,
    p_subject_key_version, p_subject_digest, p_application_id, p_installation_id,
    p_phone_key_version, p_phone_digest, v_job_id, p_idempotency_key, p_request_hash);
  IF v_quota->>'decision' IS DISTINCT FROM 'reserved' THEN
    RETURN jsonb_build_object('decision', CASE WHEN v_quota->>'decision' = 'existing'
      THEN 'idempotency_conflict' ELSE coalesce(v_quota->>'decision', 'invalid_request') END);
  END IF;

  INSERT INTO public.customer_rendering_jobs (id, tenant_id, channel, subject_key_version,
    subject_digest, application_id, installation_id, style_asset_id, style_snapshot, room_file_id,
    floor_plan_file_id, space, mode, keep_notes, idempotency_key, request_hash,
    budget_date, reserved_cost_fen)
  VALUES (v_job_id, p_tenant_id, p_channel, p_subject_key_version, p_subject_digest,
    p_application_id, p_installation_id, p_style_asset_id,
    jsonb_build_object('published_version', v_style.published_version,
      'published_at', v_style.published_at, 'title', v_style.published_title,
      'space', v_style.published_space, 'style', v_style.published_style,
      'color_notes', v_style.published_color_notes,
      'material_notes', v_style.published_material_notes,
      'source_type', v_style.published_source_type,
      'file_id', v_style_file.id, 'bucket', v_style_file.bucket,
      'region', v_style_file.region, 'object_key', v_style_file.object_key,
      'checksum', v_style_file.checksum, 'size_bytes', v_style_file.size_bytes),
    p_room_file_id,
    p_floor_plan_file_id, p_space, p_mode, p_keep_notes, p_idempotency_key,
    p_request_hash, v_day, v_settings.per_job_reserve_fen);
  RETURN jsonb_build_object('decision', 'created', 'job_id', v_job_id,
    'status', 'queued', 'quota', v_quota);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_customer_rendering_job(
  p_job_id uuid, p_attempt_id uuid, p_outcome text, p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.customer_rendering_jobs%ROWTYPE;
  v_quota jsonb;
  v_settlement text;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN
    ('approved', 'rejected', 'failed', 'provider_rejected')
    OR char_length(coalesce(p_failure_code, '')) > 120 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  IF p_outcome = 'approved' AND (v_job.provider_state <> 'response_received'
    OR v_job.result_bucket IS NULL OR v_job.result_region IS NULL
    OR v_job.result_object_key IS NULL OR v_job.result_sha256 IS NULL
    OR v_job.result_size_bytes IS NULL) THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'rejected' AND (v_job.provider_state <> 'response_received'
    OR v_job.output_review_decision IS DISTINCT FROM 'rejected') THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'failed' AND v_job.provider_state <> 'not_started' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'provider_rejected' AND v_job.provider_state <> 'intent_recorded' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  v_settlement := CASE WHEN p_outcome = 'approved' THEN 'consume' ELSE 'release' END;
  v_quota := public.settle_customer_rendering_quota(v_job.tenant_id, v_job.id, v_settlement);
  IF (v_quota->>'decision') IS NULL
    OR v_quota->>'decision' NOT IN (v_settlement, 'existing')
    OR v_quota->>'reservation_status' IS DISTINCT FROM
      (CASE WHEN v_settlement = 'consume' THEN 'consumed' ELSE 'released' END) THEN
    RAISE EXCEPTION 'customer rendering quota settlement failed for job %', v_job.id;
  END IF;
  UPDATE public.customer_rendering_job_attempts
  SET state = 'completed', failure_code = p_failure_code, finished_at = clock_timestamp()
  WHERE id = p_attempt_id;
  UPDATE public.customer_rendering_jobs
  SET status = CASE WHEN p_outcome = 'approved' THEN 'succeeded' ELSE 'failed' END,
    actual_cost_fen = CASE WHEN p_outcome = 'failed' THEN 0 ELSE actual_cost_fen END,
    failure_code = p_failure_code, lease_expires_at = NULL, finished_at = clock_timestamp()
  WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'finalized', 'status', CASE WHEN p_outcome = 'approved'
    THEN 'succeeded' ELSE 'failed' END, 'quota', v_quota);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_customer_rendering_job(
  p_tenant_id uuid, p_job_id uuid, p_decision text,
  p_operator_ref text, p_evidence_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.customer_rendering_jobs%ROWTYPE;
  v_existing public.customer_rendering_job_manual_decisions%ROWTYPE;
  v_settlement text;
  v_quota jsonb;
  v_status text;
BEGIN
  IF p_tenant_id IS NULL OR p_job_id IS NULL OR p_decision IS NULL
    OR p_decision NOT IN ('approve_audited', 'release')
    OR p_operator_ref IS NULL OR p_operator_ref !~ '^[A-Za-z0-9._:@/-]{3,120}$'
    OR p_evidence_ref IS NULL OR p_evidence_ref !~ '^[A-Za-z0-9._:@/-]{3,120}$' THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs
    WHERE tenant_id = p_tenant_id AND id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  SELECT * INTO v_existing FROM public.customer_rendering_job_manual_decisions
    WHERE tenant_id = p_tenant_id AND job_id = p_job_id;
  IF FOUND THEN
    IF v_existing.decision = p_decision AND v_existing.operator_ref = p_operator_ref
      AND v_existing.evidence_ref = p_evidence_ref THEN
      RETURN jsonb_build_object('decision', 'existing', 'status', v_job.status);
    END IF;
    RETURN jsonb_build_object('decision', 'conflict');
  END IF;
  IF v_job.status <> 'review_required' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_decision = 'approve_audited' AND (v_job.provider_state <> 'response_received'
    OR v_job.result_bucket IS NULL OR v_job.result_region IS NULL
    OR v_job.result_object_key IS NULL OR v_job.result_sha256 IS NULL
    OR v_job.result_size_bytes IS NULL) THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  v_settlement := CASE WHEN p_decision = 'approve_audited' THEN 'consume' ELSE 'release' END;
  v_status := CASE WHEN p_decision = 'approve_audited' THEN 'succeeded' ELSE 'failed' END;
  v_quota := public.settle_customer_rendering_quota(p_tenant_id, p_job_id, v_settlement);
  IF (v_quota->>'decision') IS NULL OR v_quota->>'decision' NOT IN (v_settlement, 'existing')
    OR v_quota->>'reservation_status' IS DISTINCT FROM
      (CASE WHEN v_settlement = 'consume' THEN 'consumed' ELSE 'released' END) THEN
    RAISE EXCEPTION 'customer rendering manual settlement failed for job %', p_job_id;
  END IF;
  INSERT INTO public.customer_rendering_job_manual_decisions
    (tenant_id, job_id, decision, operator_ref, evidence_ref)
  VALUES (p_tenant_id, p_job_id, p_decision, p_operator_ref, p_evidence_ref);
  UPDATE public.customer_rendering_job_attempts
    SET state = 'completed', failure_code = CASE WHEN p_decision = 'release'
      THEN 'MANUAL_RELEASE' ELSE NULL END, finished_at = clock_timestamp()
    WHERE id = v_job.attempt_id;
  UPDATE public.customer_rendering_jobs
    SET status = v_status, failure_code = CASE WHEN p_decision = 'release'
      THEN 'MANUAL_RELEASE' ELSE NULL END,
      actual_cost_fen = CASE WHEN p_decision = 'release' AND provider_state = 'not_started'
        THEN 0 ELSE actual_cost_fen END,
      lease_expires_at = NULL, finished_at = clock_timestamp()
    WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'reconciled', 'status', v_status, 'quota', v_quota);
END;
$$;

-- CREATE OR REPLACE retains existing owner and EXECUTE grants; assert the expected
-- service-only privileges explicitly for this deployment.
REVOKE ALL ON FUNCTION public.create_customer_rendering_job(uuid, text, smallint, text,
  text, uuid, smallint, text, uuid, uuid, uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_rendering_job(uuid, text, smallint, text,
  text, uuid, smallint, text, uuid, uuid, uuid, text, text, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_customer_rendering_job(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_rendering_job(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_customer_rendering_job(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_rendering_job(uuid, uuid, text, text, text) TO service_role;
COMMIT;
