-- Customer-rendering input review and closed-by-default atomic admission.
-- Rollback: disable the review worker and tenant settings first; preserve accepted jobs,
-- review decisions and quota reservations for reconciliation. Repair via a forward migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.customer_rendering_inputs
  ADD COLUMN review_due_at timestamptz,
  ADD COLUMN review_attempts integer NOT NULL DEFAULT 0 CHECK (review_attempts BETWEEN 0 AND 3),
  ADD COLUMN review_decision text CHECK (review_decision IN ('approved', 'rejected', 'manual')),
  ADD COLUMN reviewed_at timestamptz;

-- Any legacy approval must be reviewed again under the new content policy.
UPDATE public.customer_rendering_inputs
SET status = 'pending_review', review_due_at = now()
WHERE status IN ('pending_review', 'approved');
-- Preserve legacy rejection as blocked, without making it eligible for a new task.
UPDATE public.customer_rendering_inputs
SET review_decision = 'rejected', reviewed_at = now()
WHERE status = 'rejected';

ALTER TABLE public.customer_rendering_inputs
  ADD CONSTRAINT customer_rendering_inputs_review_state_check CHECK (
    (status = 'approved' AND review_decision = 'approved' AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND review_decision = 'rejected' AND reviewed_at IS NOT NULL)
    OR (status = 'pending_review' AND (
      (review_decision IS NULL AND review_due_at IS NOT NULL AND reviewed_at IS NULL)
      OR (review_decision = 'manual' AND review_due_at IS NULL AND reviewed_at IS NOT NULL)
    ))
    OR (status NOT IN ('approved', 'rejected', 'pending_review')
      AND review_decision IS NULL AND reviewed_at IS NULL)
  );

CREATE INDEX customer_rendering_inputs_review_due_idx
  ON public.customer_rendering_inputs (review_due_at, id)
  WHERE status = 'pending_review' AND review_decision IS NULL;

CREATE TABLE public.tenant_customer_rendering_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  daily_task_limit integer CHECK (daily_task_limit BETWEEN 1 AND 10000),
  daily_budget_fen bigint CHECK (daily_budget_fen BETWEEN 1 AND 100000000),
  per_job_reserve_fen bigint CHECK (per_job_reserve_fen BETWEEN 1 AND 100000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_customer_rendering_settings_enable_check CHECK (
    NOT enabled OR (daily_task_limit IS NOT NULL AND daily_budget_fen IS NOT NULL
      AND per_job_reserve_fen IS NOT NULL AND per_job_reserve_fen <= daily_budget_fen)
  )
);
CREATE TRIGGER tr_tenant_customer_rendering_settings_updated_at
  BEFORE UPDATE ON public.tenant_customer_rendering_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.tenant_customer_rendering_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_customer_rendering_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_customer_rendering_settings TO service_role;

CREATE TABLE public.customer_rendering_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('wechat', 'douyin')),
  subject_key_version smallint NOT NULL CHECK (subject_key_version > 0),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  application_id text,
  installation_id uuid,
  style_asset_id uuid NOT NULL,
  style_snapshot jsonb NOT NULL CHECK (jsonb_typeof(style_snapshot) = 'object'),
  room_file_id uuid NOT NULL,
  floor_plan_file_id uuid,
  space text NOT NULL CHECK (space IN ('living_room', 'bedroom')),
  mode text NOT NULL CHECK (mode IN ('soft_furnishing', 'renovation')),
  keep_notes text CHECK (char_length(keep_notes) <= 300),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'review_required')),
  budget_date date NOT NULL,
  reserved_cost_fen bigint NOT NULL CHECK (reserved_cost_fen > 0),
  actual_cost_fen bigint CHECK (actual_cost_fen >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_jobs_scope_check CHECK (
    (channel = 'wechat' AND application_id IS NULL AND installation_id IS NULL)
    OR (channel = 'douyin' AND application_id IS NOT NULL AND installation_id IS NOT NULL)
  ),
  CONSTRAINT customer_rendering_jobs_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_jobs_style_fkey FOREIGN KEY (tenant_id, style_asset_id)
    REFERENCES public.tenant_rendering_styles (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_jobs_room_fkey FOREIGN KEY (tenant_id, room_file_id)
    REFERENCES public.customer_rendering_inputs (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_jobs_floor_fkey FOREIGN KEY (tenant_id, floor_plan_file_id)
    REFERENCES public.customer_rendering_inputs (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_jobs_identity_key UNIQUE
    (tenant_id, channel, subject_key_version, subject_digest, idempotency_key)
);
CREATE INDEX customer_rendering_jobs_tenant_budget_idx
  ON public.customer_rendering_jobs (tenant_id, budget_date)
  INCLUDE (reserved_cost_fen, actual_cost_fen);
CREATE INDEX customer_rendering_jobs_owner_idx
  ON public.customer_rendering_jobs (tenant_id, channel, subject_key_version, subject_digest, created_at DESC, id);
CREATE INDEX customer_rendering_jobs_queued_idx
  ON public.customer_rendering_jobs (created_at, id) WHERE status = 'queued';
CREATE TRIGGER tr_customer_rendering_jobs_updated_at
  BEFORE UPDATE ON public.customer_rendering_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.customer_rendering_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_rendering_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.customer_rendering_jobs TO service_role;

CREATE FUNCTION public.create_customer_rendering_job(
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
      AND input.purpose = 'room' AND input.status = 'approved'
      AND input.review_decision = 'approved' AND input.normalized_object_key IS NOT NULL
    FOR SHARE OF input
  ) OR (p_floor_plan_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customer_rendering_inputs AS input
    WHERE input.tenant_id = p_tenant_id AND input.id = p_floor_plan_file_id
      AND input.channel = p_channel AND input.subject_key_version = p_subject_key_version
      AND input.subject_digest = p_subject_digest
      AND input.application_id IS NOT DISTINCT FROM p_application_id
      AND input.installation_id IS NOT DISTINCT FROM p_installation_id
      AND input.purpose = 'floor_plan' AND input.status = 'approved'
      AND input.review_decision = 'approved' AND input.normalized_object_key IS NOT NULL
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
REVOKE ALL ON FUNCTION public.create_customer_rendering_job(uuid, text, smallint, text,
  text, uuid, smallint, text, uuid, uuid, uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_rendering_job(uuid, text, smallint, text,
  text, uuid, smallint, text, uuid, uuid, uuid, text, text, text, uuid, text)
  TO service_role;
COMMIT;
