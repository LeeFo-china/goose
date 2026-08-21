-- Rollback: forward-only. Disable the AI explanation route, wait for active
-- leases to finish, then replace these exact RPCs with reviewed no-op
-- definitions before changing privileges. Do not restore direct table UPDATE.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.douyin_budget_ai_estimate_snapshot(
  p_estimate public.douyin_budget_estimates
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_estimate.id,
    'estimate_no', p_estimate.estimate_no,
    'tenant_id', p_estimate.tenant_id,
    'douyin_miniapp_installation_id',
      p_estimate.douyin_miniapp_installation_id,
    'subject_hash', p_estimate.subject_hash,
    'request_payload', p_estimate.request_payload,
    'result_payload', p_estimate.result_payload,
    'ai_status', p_estimate.ai_status,
    'ai_analysis', p_estimate.ai_analysis,
    'ai_provider', p_estimate.ai_provider,
    'ai_model', p_estimate.ai_model,
    'ai_attempt_count', p_estimate.ai_attempt_count,
    'ai_claimed_at', p_estimate.ai_claimed_at,
    'expires_at', p_estimate.expires_at
  );
$function$;

REVOKE ALL ON FUNCTION public.douyin_budget_ai_estimate_snapshot(
  public.douyin_budget_estimates
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.claim_douyin_budget_ai_analysis(
  p_estimate_id uuid,
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_retry boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estimate public.douyin_budget_estimates%ROWTYPE;
  v_now timestamptz;
  v_action text := 'saved';
BEGIN
  SELECT estimate.*
  INTO v_estimate
  FROM public.douyin_budget_estimates AS estimate
  WHERE estimate.id = p_estimate_id
    AND estimate.tenant_id = p_tenant_id
    AND estimate.douyin_miniapp_installation_id =
      p_douyin_miniapp_installation_id
    AND estimate.subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'
      )
    );
  END IF;

  v_now := clock_timestamp();
  IF v_estimate.expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 410,
        'code', 'DOUYIN_BUDGET_ESTIMATE_EXPIRED'
      )
    );
  END IF;

  IF v_estimate.ai_status = 'pending'
    AND v_estimate.ai_claimed_at IS NULL
  THEN
    UPDATE public.douyin_budget_estimates
    SET ai_attempt_count = ai_attempt_count + 1,
        ai_claimed_at = v_now
    WHERE id = v_estimate.id
    RETURNING * INTO v_estimate;
    v_action := 'claimed';
  ELSIF v_estimate.ai_status = 'pending'
    AND v_estimate.ai_claimed_at <= v_now - interval '60 seconds'
  THEN
    IF v_estimate.ai_attempt_count < 3 THEN
      UPDATE public.douyin_budget_estimates
      SET ai_attempt_count = ai_attempt_count + 1,
          ai_claimed_at = v_now
      WHERE id = v_estimate.id
      RETURNING * INTO v_estimate;
      v_action := 'claimed';
    ELSE
      UPDATE public.douyin_budget_estimates
      SET ai_status = 'failed',
          ai_claimed_at = NULL,
          ai_last_error_code = 'DOUYIN_BUDGET_AI_ATTEMPTS_EXHAUSTED'
      WHERE id = v_estimate.id
      RETURNING * INTO v_estimate;
    END IF;
  ELSIF v_estimate.ai_status = 'failed' AND p_retry
    AND v_estimate.ai_attempt_count < 3
  THEN
    UPDATE public.douyin_budget_estimates
    SET ai_status = 'pending',
        ai_attempt_count = ai_attempt_count + 1,
        ai_claimed_at = v_now,
        ai_last_error_code = NULL
    WHERE id = v_estimate.id
    RETURNING * INTO v_estimate;
    v_action := 'claimed';
  ELSIF v_estimate.ai_status = 'skipped' THEN
    v_action := 'saved';
  END IF;

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'action', v_action,
      'estimate', public.douyin_budget_ai_estimate_snapshot(v_estimate)
    ) || CASE
      WHEN v_action = 'claimed' THEN jsonb_build_object(
        'lease', jsonb_build_object(
          'attempt_count', v_estimate.ai_attempt_count,
          'claimed_at', v_estimate.ai_claimed_at
        )
      )
      ELSE '{}'::jsonb
    END
  );
END;
$function$;

CREATE FUNCTION public.complete_douyin_budget_ai_analysis(
  p_estimate_id uuid,
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_attempt_count integer,
  p_claimed_at timestamptz,
  p_ai_analysis jsonb,
  p_ai_provider text,
  p_ai_model text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estimate public.douyin_budget_estimates%ROWTYPE;
BEGIN
  SELECT estimate.*
  INTO v_estimate
  FROM public.douyin_budget_estimates AS estimate
  WHERE estimate.id = p_estimate_id
    AND estimate.tenant_id = p_tenant_id
    AND estimate.douyin_miniapp_installation_id =
      p_douyin_miniapp_installation_id
    AND estimate.subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'
      )
    );
  END IF;
  IF v_estimate.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 410,
        'code', 'DOUYIN_BUDGET_ESTIMATE_EXPIRED'
      )
    );
  END IF;

  IF v_estimate.ai_status = 'pending'
    AND v_estimate.ai_attempt_count = p_attempt_count
    AND v_estimate.ai_claimed_at = p_claimed_at
  THEN
    IF p_ai_analysis IS NULL
      OR jsonb_typeof(p_ai_analysis) <> 'object'
      OR p_ai_provider IS NULL
      OR p_ai_provider <> btrim(p_ai_provider)
      OR char_length(p_ai_provider) NOT BETWEEN 1 AND 100
      OR p_ai_model IS NULL
      OR p_ai_model <> btrim(p_ai_model)
      OR char_length(p_ai_model) NOT BETWEEN 1 AND 100
    THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 500,
          'code', 'DOUYIN_BUDGET_AI_COMMAND_INVALID'
        )
      );
    END IF;
    UPDATE public.douyin_budget_estimates
    SET ai_status = 'succeeded',
        ai_analysis = p_ai_analysis,
        ai_provider = p_ai_provider,
        ai_model = p_ai_model,
        ai_claimed_at = NULL,
        ai_last_error_code = NULL
    WHERE id = v_estimate.id
    RETURNING * INTO v_estimate;
  END IF;

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'estimate', public.douyin_budget_ai_estimate_snapshot(v_estimate)
    )
  );
END;
$function$;

CREATE FUNCTION public.fail_douyin_budget_ai_analysis(
  p_estimate_id uuid,
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_attempt_count integer,
  p_claimed_at timestamptz,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estimate public.douyin_budget_estimates%ROWTYPE;
BEGIN
  SELECT estimate.*
  INTO v_estimate
  FROM public.douyin_budget_estimates AS estimate
  WHERE estimate.id = p_estimate_id
    AND estimate.tenant_id = p_tenant_id
    AND estimate.douyin_miniapp_installation_id =
      p_douyin_miniapp_installation_id
    AND estimate.subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_BUDGET_ESTIMATE_NOT_FOUND'
      )
    );
  END IF;
  IF v_estimate.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 410,
        'code', 'DOUYIN_BUDGET_ESTIMATE_EXPIRED'
      )
    );
  END IF;

  IF v_estimate.ai_status = 'pending'
    AND v_estimate.ai_attempt_count = p_attempt_count
    AND v_estimate.ai_claimed_at = p_claimed_at
  THEN
    IF p_error_code IS NULL
      OR p_error_code !~ '^DOUYIN_BUDGET_[A-Z0-9_]{1,80}$'
    THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 500,
          'code', 'DOUYIN_BUDGET_AI_COMMAND_INVALID'
        )
      );
    END IF;
    UPDATE public.douyin_budget_estimates
    SET ai_status = 'failed',
        ai_analysis = NULL,
        ai_provider = NULL,
        ai_model = NULL,
        ai_claimed_at = NULL,
        ai_last_error_code = p_error_code
    WHERE id = v_estimate.id
    RETURNING * INTO v_estimate;
  END IF;

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'estimate', public.douyin_budget_ai_estimate_snapshot(v_estimate)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, boolean
)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, integer, timestamptz, jsonb, text, text
)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, integer, timestamptz, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, boolean
)
TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, integer, timestamptz, jsonb, text, text
)
TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_douyin_budget_ai_analysis(
  uuid, uuid, uuid, text, integer, timestamptz, text
)
TO service_role;

REVOKE UPDATE
ON TABLE public.douyin_budget_estimates
FROM service_role;

COMMIT;
