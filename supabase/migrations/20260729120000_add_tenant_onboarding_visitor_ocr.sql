-- Rollback: disable the tenant-onboarding OCR switch, expire visitor OCR rows,
-- drop ocr_claim_visitor_recognition and visitor-only indexes, restore the
-- tenant/platform scope and scene constraints, then drop the visitor columns.

BEGIN;

ALTER TABLE public.ocr_recognitions
ADD COLUMN actor_visitor_id text NULL,
ADD COLUMN request_ip_hash text NULL,
ADD COLUMN provider_started_at timestamptz NULL,
ADD COLUMN processing_deadline_at timestamptz NULL;

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scope_type_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scope_type_check
CHECK (scope_type IN ('tenant', 'platform', 'visitor'));

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scope_tenant_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scope_tenant_check
CHECK (
  (
    scope_type = 'tenant'
    AND tenant_id IS NOT NULL
    AND actor_visitor_id IS NULL
    AND request_ip_hash IS NULL
    AND processing_deadline_at IS NULL
  )
  OR (
    scope_type = 'platform'
    AND tenant_id IS NULL
    AND actor_visitor_id IS NULL
    AND request_ip_hash IS NULL
    AND processing_deadline_at IS NULL
  )
  OR (
    scope_type = 'visitor'
    AND tenant_id IS NULL
    AND actor_employee_id IS NULL
    AND actor_visitor_id IS NOT NULL
    AND btrim(actor_visitor_id) <> ''
    AND request_ip_hash IS NOT NULL
    AND request_ip_hash ~ '^[a-f0-9]{64}$'
    AND processing_deadline_at IS NOT NULL
  )
);

ALTER TABLE public.ocr_recognitions
DROP CONSTRAINT IF EXISTS ocr_recognitions_scene_check;

ALTER TABLE public.ocr_recognitions
ADD CONSTRAINT ocr_recognitions_scene_check
CHECK (
  scene IN (
    'wechat_pay_applyment',
    'expense_request',
    'merchant_material',
    'supplier_onboarding',
    'tenant_onboarding_license'
  )
);

CREATE UNIQUE INDEX ocr_recognitions_visitor_idempotency_idx
ON public.ocr_recognitions(actor_visitor_id, idempotency_key)
WHERE scope_type = 'visitor';

CREATE INDEX ocr_recognitions_visitor_daily_usage_idx
ON public.ocr_recognitions(actor_visitor_id, provider_started_at DESC)
WHERE scope_type = 'visitor'
  AND provider_started_at IS NOT NULL;

CREATE INDEX ocr_recognitions_visitor_ip_usage_idx
ON public.ocr_recognitions(request_ip_hash, provider_started_at DESC)
WHERE scope_type = 'visitor'
  AND provider_started_at IS NOT NULL;

CREATE INDEX ocr_recognitions_visitor_processing_idx
ON public.ocr_recognitions(actor_visitor_id, processing_deadline_at)
WHERE scope_type = 'visitor'
  AND status = 'processing';

DROP INDEX IF EXISTS public.ocr_recognitions_expiry_idx;

CREATE INDEX ocr_recognitions_expiry_idx
ON public.ocr_recognitions(expires_at)
WHERE status IN ('processing', 'succeeded', 'failed');

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
SELECT
  setting.key,
  'ocr',
  setting.name,
  setting.description,
  setting.value_type,
  setting.value_text,
  false,
  'active'
FROM (
  VALUES
    (
      'TENCENT_OCR_TENANT_ONBOARDING_ENABLED',
      '装企入驻营业执照识别',
      '是否向 visitor 开放装企入驻营业执照识别。',
      'boolean',
      'false'
    ),
    (
      'TENCENT_OCR_VISITOR_DAILY_LIMIT',
      '访客OCR单日额度',
      '每个 visitor 每个 UTC 自然日可发起的OCR调用上限。',
      'number',
      '5'
    ),
    (
      'TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS',
      '访客OCR IP窗口秒数',
      '访客OCR按可信客户端IP限流的固定窗口秒数。',
      'number',
      '60'
    ),
    (
      'TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT',
      '访客OCR IP窗口额度',
      '同一可信客户端IP在固定窗口内可发起的OCR调用上限。',
      'number',
      '20'
    ),
    (
      'TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS',
      '访客OCR处理租约秒数',
      'visitor processing 记录允许占用并发的最长时间。',
      'number',
      '30'
    ),
    (
      'TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT',
      '单访客OCR并发上限',
      '单个 visitor 同时处于 processing 的识别数量上限。',
      'number',
      '1'
    ),
    (
      'TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT',
      '访客OCR总并发上限',
      '全部 visitor 同时处于 processing 的识别数量上限。',
      'number',
      '8'
    )
) AS setting(key, name, description, value_type, value_text)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = setting.key
);

CREATE OR REPLACE FUNCTION public.ocr_claim_visitor_recognition(
  p_actor_visitor_id text,
  p_file_object_id uuid,
  p_file_checksum text,
  p_idempotency_key uuid,
  p_request_ip_hash text,
  p_now timestamptz,
  p_expires_at timestamptz,
  p_processing_deadline_at timestamptz,
  p_daily_limit integer,
  p_ip_window_seconds integer,
  p_ip_window_limit integer,
  p_visitor_concurrency_limit integer,
  p_global_concurrency_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.ocr_recognitions%ROWTYPE;
  v_created public.ocr_recognitions%ROWTYPE;
  v_count integer;
  v_retry_after_seconds integer;
  v_utc_day_start timestamptz;
BEGIN
  IF p_actor_visitor_id IS NULL OR btrim(p_actor_visitor_id) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'actor visitor id is required';
  END IF;
  IF p_request_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'request ip hash is invalid';
  END IF;
  IF p_expires_at <= p_now OR p_processing_deadline_at <= p_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'recognition deadlines are invalid';
  END IF;
  IF p_daily_limit < 1
    OR p_ip_window_seconds < 1
    OR p_ip_window_limit < 1
    OR p_visitor_concurrency_limit < 1
    OR p_global_concurrency_limit < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'recognition limits are invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ocr:visitor:global', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ocr:visitor:ip:' || p_request_ip_hash, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ocr:visitor:actor:' || p_actor_visitor_id, 0)
  );

  SELECT recognition.*
  INTO v_existing
  FROM public.ocr_recognitions AS recognition
  WHERE recognition.scope_type = 'visitor'
    AND recognition.actor_visitor_id = p_actor_visitor_id
    AND recognition.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'expired' OR v_existing.expires_at <= p_now THEN
      UPDATE public.ocr_recognitions
      SET
        status = 'expired',
        result_ciphertext = NULL
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;

      RETURN pg_catalog.jsonb_build_object(
        'outcome', 'expired',
        'recognition', pg_catalog.to_jsonb(v_existing)
      );
    END IF;

    IF v_existing.file_object_id <> p_file_object_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'outcome', 'idempotency_conflict',
        'recognition', pg_catalog.to_jsonb(v_existing)
      );
    END IF;

    IF v_existing.status = 'processing' THEN
      IF v_existing.processing_deadline_at <= p_now THEN
        UPDATE public.ocr_recognitions
        SET
          status = 'failed',
          result_ciphertext = NULL,
          provider_error_code = 'OCR_PROCESSING_LEASE_EXPIRED',
          provider_error_message_safe = 'OCR识别处理超时',
          processed_at = p_now
        WHERE id = v_existing.id
        RETURNING * INTO v_existing;

        RETURN pg_catalog.jsonb_build_object(
          'outcome', 'existing',
          'recognition', pg_catalog.to_jsonb(v_existing)
        );
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'outcome', 'in_progress',
        'recognition', pg_catalog.to_jsonb(v_existing)
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'existing',
      'recognition', pg_catalog.to_jsonb(v_existing)
    );
  END IF;

  v_utc_day_start := (
    pg_catalog.date_trunc('day', p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.ocr_recognitions AS recognition
  WHERE recognition.scope_type = 'visitor'
    AND recognition.actor_visitor_id = p_actor_visitor_id
    AND recognition.provider_started_at IS NOT NULL
    AND recognition.provider_started_at >= v_utc_day_start;

  IF v_count >= p_daily_limit THEN
    v_retry_after_seconds := pg_catalog.greatest(
      1,
      pg_catalog.ceil(
        pg_catalog.extract(
          epoch FROM (v_utc_day_start + interval '1 day' - p_now)
        )
      )::integer
    );
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'daily_limited',
      'retry_after_seconds', v_retry_after_seconds
    );
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.ocr_recognitions AS recognition
  WHERE recognition.scope_type = 'visitor'
    AND recognition.request_ip_hash = p_request_ip_hash
    AND recognition.provider_started_at IS NOT NULL
    AND recognition.provider_started_at >=
      p_now - pg_catalog.make_interval(secs => p_ip_window_seconds);

  IF v_count >= p_ip_window_limit THEN
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'rate_limited',
      'retry_after_seconds', p_ip_window_seconds
    );
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.ocr_recognitions AS recognition
  WHERE recognition.scope_type = 'visitor'
    AND recognition.actor_visitor_id = p_actor_visitor_id
    AND recognition.status = 'processing'
    AND recognition.processing_deadline_at > p_now;

  IF v_count >= p_visitor_concurrency_limit THEN
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'rate_limited',
      'retry_after_seconds', 1
    );
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.ocr_recognitions AS recognition
  WHERE recognition.scope_type = 'visitor'
    AND recognition.status = 'processing'
    AND recognition.processing_deadline_at > p_now;

  IF v_count >= p_global_concurrency_limit THEN
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'rate_limited',
      'retry_after_seconds', 1
    );
  END IF;

  INSERT INTO public.ocr_recognitions (
    scope_type,
    tenant_id,
    actor_employee_id,
    actor_visitor_id,
    scene,
    document_type,
    provider,
    provider_action,
    file_object_id,
    file_checksum,
    subject_type,
    subject_id,
    status,
    idempotency_key,
    dedupe_key,
    request_ip_hash,
    provider_started_at,
    processing_deadline_at,
    expires_at
  )
  VALUES (
    'visitor',
    NULL,
    NULL,
    p_actor_visitor_id,
    'tenant_onboarding_license',
    'business_license',
    'tencent_cloud',
    'BizLicenseOCR',
    p_file_object_id,
    p_file_checksum,
    NULL,
    NULL,
    'processing',
    p_idempotency_key,
    'visitor:' || p_idempotency_key::text,
    p_request_ip_hash,
    p_now,
    p_processing_deadline_at,
    p_expires_at
  )
  RETURNING * INTO v_created;

  RETURN pg_catalog.jsonb_build_object(
    'outcome', 'created',
    'recognition', pg_catalog.to_jsonb(v_created)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ocr_claim_visitor_recognition(
  text,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ocr_claim_visitor_recognition(
  text,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer
) TO service_role;

COMMENT ON FUNCTION public.ocr_claim_visitor_recognition(
  text,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer
) IS 'Atomically claims a purpose-limited tenant-onboarding OCR call for one visitor.';

COMMIT;
