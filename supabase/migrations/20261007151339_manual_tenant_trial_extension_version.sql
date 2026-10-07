BEGIN;

CREATE OR REPLACE FUNCTION public.platform_service_trial_extend(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_extension_days integer,
  p_reason text,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_from_status text;
  v_new_end timestamptz;
  v_grace_days integer;
  v_override_needed boolean;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL OR p_extension_days IS NULL
    OR p_extension_days NOT BETWEEN 1 AND 365
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 1000
    OR p_allow_override IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'extend', 'trial_id', p_trial_id,
    'expected_version', p_expected_version, 'extension_days', p_extension_days,
    'reason', btrim(p_reason)
  )::text, 'sha256');
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage', 'platform.service_trial.override']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_identity.enterprise_identity_hash, 'hex'),
    20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_identity.tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  -- Check the stored version under a row lock before clock-driven normalization.
  -- A trial entering grace without a worker tick must remain extendable from
  -- the current list snapshot; concurrent business changes still conflict.
  SELECT * INTO v_trial FROM public.tenant_service_trials
  WHERE id = p_trial_id AND tenant_id = v_identity.tenant_id FOR UPDATE;
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.status NOT IN ('active', 'grace_period') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_from_status := v_trial.status;
  v_override_needed := (
    v_trial.extension_count >= coalesce(
      (v_trial.policy_snapshot->>'max_extension_count')::integer, 1
    ) OR p_extension_days > coalesce(
      (v_trial.policy_snapshot->>'max_extension_days')::integer, 30
    )
  );
  IF v_override_needed AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.extension_count >= 20 THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_new_end := greatest(v_now, v_trial.trial_ends_at)
    + make_interval(days => p_extension_days);
  IF v_new_end > v_trial.starts_at + interval '365 days' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_grace_days := least(30, greatest(0,
    extract(epoch FROM (v_trial.grace_ends_at - v_trial.trial_ends_at))::integer / 86400
  ));
  UPDATE public.tenant_service_trials SET
    status = 'active', activated_at = coalesce(activated_at, v_now),
    trial_ends_at = v_new_end,
    grace_ends_at = v_new_end + make_interval(days => v_grace_days),
    extension_count = extension_count + 1,
    version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    reason, actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'extend:' || v_trial.version::text,
    'trial_extended', v_from_status, 'active', btrim(p_reason),
    p_actor_employee_id,
    jsonb_build_object('extension_days', p_extension_days,
      'override_used', v_override_needed),
    v_now
  );
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

COMMIT;
