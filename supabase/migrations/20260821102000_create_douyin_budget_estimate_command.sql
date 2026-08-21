-- Rollback: forward-only. In a reviewed maintenance-window migration, first
-- stop budget estimate traffic and revoke EXECUTE from service_role, then drop
-- this exact function signature. Existing estimates and both earlier budget
-- migrations remain untouched; restoring the former non-atomic API writer is
-- not a valid rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.create_douyin_budget_estimate(
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_request_ip_hash text,
  p_pricing_version_id uuid,
  p_estimate_no text,
  p_request_payload jsonb,
  p_result_payload jsonb,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id uuid;
  v_now timestamptz;
  v_lock_key text;
  v_subject_count integer;
  v_ip_count integer;
  v_result_payload jsonb;
  v_constraint_name text;
BEGIN
  IF p_tenant_id IS NULL
    OR p_douyin_miniapp_installation_id IS NULL
    OR p_pricing_version_id IS NULL
    OR p_subject_hash IS NULL
    OR p_subject_hash !~ '^[0-9a-f]{64}$'
    OR p_request_ip_hash IS NULL
    OR p_request_ip_hash !~ '^[0-9a-f]{64}$'
    OR p_estimate_no IS NULL
    OR p_estimate_no !~ '^DYYS-[0-9]{8}-[0-9]{6}$'
    OR p_request_payload IS NULL
    OR jsonb_typeof(p_request_payload) <> 'object'
    OR p_result_payload IS NULL
    OR jsonb_typeof(p_result_payload) <> 'object'
    OR p_expires_at IS NULL
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_BUDGET_COMMAND_INVALID'
      )
    );
  END IF;

  -- PostgreSQL hashtextextended is stable for the lifetime of a running
  -- cluster. A rare 64-bit collision can only serialize unrelated callers;
  -- it cannot skip either rate-limit check.
  FOR v_lock_key IN
    SELECT rate_lock.lock_key
    FROM (
      VALUES
        (
          'douyin-budget-rate:' || p_tenant_id::text ||
            ':subject:' || p_subject_hash
        ),
        (
          'douyin-budget-rate:' || p_tenant_id::text ||
            ':ip:' || p_request_ip_hash
        )
    ) AS rate_lock(lock_key)
    ORDER BY lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_key, 6720260821102000)
    );
  END LOOP;

  v_now := clock_timestamp();
  IF p_expires_at <= v_now
    OR p_expires_at > v_now + interval '31 days'
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_BUDGET_COMMAND_INVALID'
      )
    );
  END IF;

  PERFORM installation.id
  FROM public.douyin_miniapp_installations AS installation
  JOIN public.tenants AS tenant
    ON tenant.id = installation.tenant_id
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active'
    AND tenant.status = 'active'
  FOR SHARE OF installation, tenant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED'
      )
    );
  END IF;

  PERFORM pricing_version.id
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.id = p_pricing_version_id
    AND pricing_version.tenant_id = p_tenant_id
    AND pricing_version.status = 'active'
    AND pricing_version.effective_from <= v_now
    AND (
      pricing_version.effective_to IS NULL
      OR pricing_version.effective_to > v_now
    )
  FOR SHARE OF pricing_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_BUDGET_NOT_CONFIGURED'
      )
    );
  END IF;

  SELECT count(*)
  INTO v_subject_count
  FROM (
    SELECT 1
    FROM public.douyin_budget_estimates AS estimate
    WHERE estimate.tenant_id = p_tenant_id
      AND estimate.subject_hash = p_subject_hash
      AND estimate.created_at >= v_now - interval '10 minutes'
    ORDER BY estimate.created_at DESC
    LIMIT 20
  ) AS recent_subject;

  SELECT count(*)
  INTO v_ip_count
  FROM (
    SELECT 1
    FROM public.douyin_budget_estimates AS estimate
    WHERE estimate.tenant_id = p_tenant_id
      AND estimate.request_ip_hash = p_request_ip_hash
      AND estimate.created_at >= v_now - interval '10 minutes'
    ORDER BY estimate.created_at DESC
    LIMIT 20
  ) AS recent_ip;

  IF v_subject_count >= 20 OR v_ip_count >= 20 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 429,
        'code', 'DOUYIN_BUDGET_RATE_LIMITED'
      )
    );
  END IF;

  v_id := gen_random_uuid();
  v_result_payload := (p_result_payload - 'id' - 'estimate_no')
    || jsonb_build_object(
      'id', v_id,
      'estimate_no', p_estimate_no
    );

  INSERT INTO public.douyin_budget_estimates (
    id,
    tenant_id,
    douyin_miniapp_installation_id,
    subject_hash,
    request_ip_hash,
    pricing_version_id,
    estimate_no,
    request_payload,
    result_payload,
    ai_status,
    expires_at,
    created_at
  )
  VALUES (
    v_id,
    p_tenant_id,
    p_douyin_miniapp_installation_id,
    p_subject_hash,
    p_request_ip_hash,
    p_pricing_version_id,
    p_estimate_no,
    p_request_payload,
    v_result_payload,
    'pending',
    p_expires_at,
    v_now
  );

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'id', v_id,
      'estimate_no', p_estimate_no,
      'tenant_id', p_tenant_id,
      'douyin_miniapp_installation_id', p_douyin_miniapp_installation_id,
      'pricing_version_id', p_pricing_version_id,
      'ai_status', 'pending'
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'douyin_budget_estimates_estimate_no_key' THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT'
        )
      );
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_douyin_budget_estimate(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, timestamptz
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_douyin_budget_estimate(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb, timestamptz
)
TO service_role;

COMMIT;
