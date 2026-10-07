BEGIN;

-- Keep provisional history in enterprise deduplication after verification.
CREATE OR REPLACE FUNCTION public.platform_service_trial_grant(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_trial_type text,
  p_scope jsonb,
  p_reason text,
  p_idempotency_key uuid,
  p_trial_days integer DEFAULT NULL,
  p_grace_days integer DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_assignee_employee_id uuid DEFAULT NULL,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text := 'tenant:' || p_tenant_id::text;
  v_request_hash bytea;
  v_replay jsonb;
  v_credit_code text;
  v_enterprise_hash bytea;
  v_identity_tenant_ids uuid[];
  v_identity_basis text := 'verified_enterprise';
  v_creation_source text;
  v_tenant_status text;
  v_policy public.platform_service_trial_policies%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_existing record;
  v_trial_days integer;
  v_grace_days integer;
  v_starts_at timestamptz;
  v_scope jsonb;
  v_override_needed boolean;
  v_repeat_requires_override boolean;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR p_trial_type IS NULL OR p_trial_type NOT IN ('standard', 'guided')
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 1000
    OR (p_trial_type = 'guided' AND p_assignee_employee_id IS NULL)
    OR p_allow_override IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'grant', 'tenant_id', p_tenant_id, 'trial_type', p_trial_type,
    'scope', p_scope, 'reason', btrim(p_reason), 'trial_days', p_trial_days,
    'grace_days', p_grace_days, 'starts_at', p_starts_at,
    'assignee_employee_id', p_assignee_employee_id
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;

  IF p_assignee_employee_id IS NOT NULL THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_assignee_employee_id, '{}'::text[]
    );
  END IF;
  SELECT tenant.creation_source, tenant.status
    INTO v_creation_source, v_tenant_status
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND OR v_tenant_status <> 'active' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  SELECT regexp_replace(
    upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
  )
  INTO v_credit_code
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
    AND application.status = 'approved'
    AND application.reviewed_at IS NOT NULL
    AND regexp_replace(
      upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
    ) = regexp_replace(
      upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g'
    );
  IF FOUND AND NULLIF(v_credit_code, '') IS NOT NULL THEN
    v_enterprise_hash := extensions.digest(v_credit_code, 'sha256');
  ELSIF v_creation_source = 'platform_manual' THEN
    v_identity_basis := 'provisional_tenant';
    v_enterprise_hash := extensions.digest(
      'provisional-tenant:' || p_tenant_id::text, 'sha256'
    );
  ELSE
    RAISE EXCEPTION 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_enterprise_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || p_tenant_id::text, 20260811005555
  ));
  IF v_identity_basis = 'verified_enterprise' THEN
    PERFORM public.platform_service_trial_lock_verified_enterprise_identity(
      p_tenant_id, v_enterprise_hash
    );
  END IF;

  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;

  -- Include provisional history after its tenant completes verification.
  -- Resolve the enterprise's related tenants once, rather than looking them
  -- up for every trial. The requesting tenant is always included.
  SELECT ARRAY[p_tenant_id] || coalesce(array_agg(DISTINCT tenant.id), '{}'::uuid[])
  INTO v_identity_tenant_ids
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE application.status = 'approved' AND application.reviewed_at IS NOT NULL
    AND regexp_replace(upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g')
      = regexp_replace(upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g')
    AND extensions.digest(regexp_replace(upper(btrim(tenant.unified_social_credit_code)),
      '\s+', '', 'g'), 'sha256') = v_enterprise_hash;

  FOR v_existing IN
    SELECT id, tenant_id FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
    ORDER BY tenant_id, id
  LOOP
    PERFORM public.platform_service_trial_normalize_effective_status(
      v_existing.id, v_existing.tenant_id, v_now
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_contracts AS contract
    WHERE contract.tenant_id = p_tenant_id
      AND contract.service_family = 'platform_technical_service'
      AND contract.status = 'active'
      AND contract.service_start_at <= v_now AND contract.service_end_at > v_now
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_service_orders AS paid_onboarding
    WHERE paid_onboarding.tenant_id = p_tenant_id
      AND paid_onboarding.payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
      AND paid_onboarding.service_status NOT IN ('accepted', 'active')
      AND paid_onboarding.paid_at IS NOT NULL
      AND paid_onboarding.service_access_terminated_at IS NULL
  ) THEN RAISE EXCEPTION 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
      AND status = 'pending_review') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_APPLICATION_PENDING' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
      AND status IN ('scheduled', 'active', 'grace_period')) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTIVE_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_policy FROM public.platform_service_trial_policies
  WHERE is_current = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_scope := coalesce(p_scope, CASE WHEN p_trial_type = 'guided'
    THEN v_policy.guided_scope ELSE v_policy.standard_scope END);
  IF NOT public.platform_service_trial_scope_valid(v_scope) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_repeat_requires_override := EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
      AND (granted_at IS NOT NULL OR converted_order_id IS NOT NULL))
    AND NOT v_policy.allow_repeat;
  IF v_repeat_requires_override AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  v_trial_days := coalesce(p_trial_days, v_policy.trial_days);
  v_grace_days := CASE WHEN v_creation_source = 'platform_manual' THEN 7
    ELSE coalesce(p_grace_days, v_policy.grace_days) END;
  v_starts_at := coalesce(p_starts_at, v_now);
  v_override_needed := v_repeat_requires_override
    OR v_trial_days > v_policy.max_trial_days
    OR v_grace_days > v_policy.max_grace_days
    OR v_starts_at > v_now + make_interval(days => v_policy.max_schedule_days);
  IF v_trial_days NOT BETWEEN 1 AND 365 OR v_grace_days NOT BETWEEN 0 AND 30
    OR v_starts_at < v_now - interval '5 minutes'
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  IF v_override_needed AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_override_needed THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_actor_employee_id, ARRAY['platform.service_trial.override']
    );
  END IF;
  v_status := CASE WHEN v_starts_at > v_now THEN 'scheduled' ELSE 'active' END;

  INSERT INTO public.tenant_service_trials (
    tenant_id, enterprise_identity_hash, identity_basis, source, trial_type, status,
    grant_reason, granted_at, granted_by_employee_id, starts_at, activated_at,
    trial_ends_at, grace_ends_at, assignee_employee_id,
    scope_snapshot, policy_snapshot
  ) VALUES (
    p_tenant_id, v_enterprise_hash, v_identity_basis,
    'platform_grant', p_trial_type, v_status,
    btrim(p_reason), v_now, p_actor_employee_id, v_starts_at,
    CASE WHEN v_status = 'active' THEN v_now ELSE NULL END,
    v_starts_at + make_interval(days => v_trial_days),
    v_starts_at + make_interval(days => v_trial_days + v_grace_days),
    p_assignee_employee_id, v_scope,
    jsonb_build_object(
      'policy_id', v_policy.id, 'version', v_policy.version,
      'trial_days', v_trial_days, 'grace_days', v_grace_days,
      'max_trial_days', v_policy.max_trial_days,
      'max_grace_days', v_policy.max_grace_days,
      'max_schedule_days', v_policy.max_schedule_days,
      'max_extension_count', v_policy.max_extension_count,
      'max_extension_days', v_policy.max_extension_days,
      'reapply_cooldown_days', v_policy.reapply_cooldown_days,
      'allow_repeat', v_policy.allow_repeat,
      'reminder_days', to_jsonb(v_policy.reminder_days),
      'override_used', v_override_needed
    )
  ) RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, to_status,
    reason, actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'trial-granted', 'trial_granted',
    v_trial.status, btrim(p_reason), p_actor_employee_id,
    jsonb_build_object('trial_type', p_trial_type, 'identity_basis', v_identity_basis,
      'override_used', v_override_needed),
    v_now
  );
  IF v_status = 'active' THEN
    INSERT INTO public.tenant_service_trial_events (
      tenant_id, trial_id, event_key, event_type, to_status,
      actor_employee_id, metadata, occurred_at
    ) VALUES (
      v_trial.tenant_id, v_trial.id,
      'effective:active:' || extract(epoch FROM v_trial.starts_at)::text,
      'trial_activated', 'active', p_actor_employee_id, '{}'::jsonb,
      v_trial.starts_at
    ) ON CONFLICT (trial_id, event_key) DO NOTHING;
  END IF;
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

CREATE OR REPLACE FUNCTION public.platform_service_trial_apply(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_application_reason text,
  p_expected_user_count integer,
  p_expected_project_count integer,
  p_contact_name text,
  p_contact_phone text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text := 'tenant:' || p_tenant_id::text;
  v_request_hash bytea;
  v_replay jsonb;
  v_credit_code text;
  v_enterprise_hash bytea;
  v_identity_tenant_ids uuid[];
  v_policy public.platform_service_trial_policies%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_existing record;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR NULLIF(btrim(p_application_reason), '') IS NULL
    OR char_length(p_application_reason) > 1000
    OR p_expected_user_count IS NULL
    OR p_expected_user_count NOT BETWEEN 1 AND 100000
    OR p_expected_project_count IS NULL
    OR p_expected_project_count NOT BETWEEN 1 AND 1000000
    OR NULLIF(btrim(p_contact_name), '') IS NULL OR char_length(p_contact_name) > 80
    OR p_contact_phone IS NULL
    OR p_contact_phone !~ '^1[3-9][0-9]{9}$'
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'apply', 'tenant_id', p_tenant_id,
    'application_reason', btrim(p_application_reason),
    'expected_user_count', p_expected_user_count,
    'expected_project_count', p_expected_project_count,
    'contact_name', btrim(p_contact_name), 'contact_phone', p_contact_phone
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_tenant_actor(
    p_actor_employee_id, p_tenant_id, ARRAY['billing.service_trial.apply']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT regexp_replace(
    upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
  )
  INTO v_credit_code
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
    AND application.status = 'approved'
    AND application.reviewed_at IS NOT NULL
    AND regexp_replace(
      upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
    ) = regexp_replace(
      upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g'
    );
  IF NOT FOUND OR NULLIF(v_credit_code, '') IS NULL THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_enterprise_hash := extensions.digest(v_credit_code, 'sha256');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_enterprise_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || p_tenant_id::text, 20260811005555
  ));

  PERFORM public.platform_service_trial_lock_verified_enterprise_identity(
    p_tenant_id, v_enterprise_hash
  );

  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Include provisional history after its tenant completes verification.
  -- Resolve the enterprise's related tenants once, rather than looking them
  -- up for every trial. The requesting tenant is always included.
  SELECT ARRAY[p_tenant_id] || coalesce(array_agg(DISTINCT tenant.id), '{}'::uuid[])
  INTO v_identity_tenant_ids
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE application.status = 'approved' AND application.reviewed_at IS NOT NULL
    AND regexp_replace(upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g')
      = regexp_replace(upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g')
    AND extensions.digest(regexp_replace(upper(btrim(tenant.unified_social_credit_code)),
      '\s+', '', 'g'), 'sha256') = v_enterprise_hash;

  FOR v_existing IN
    SELECT id, tenant_id FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
    ORDER BY tenant_id, id
  LOOP
    PERFORM public.platform_service_trial_normalize_effective_status(
      v_existing.id, v_existing.tenant_id, v_now
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_contracts AS contract
    WHERE contract.tenant_id = p_tenant_id
      AND contract.service_family = 'platform_technical_service'
      AND contract.status = 'active'
      AND contract.service_start_at <= v_now AND contract.service_end_at > v_now
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_service_orders AS paid_onboarding
    WHERE paid_onboarding.tenant_id = p_tenant_id
      AND paid_onboarding.payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
      AND paid_onboarding.service_status NOT IN ('accepted', 'active')
      AND paid_onboarding.paid_at IS NOT NULL
      AND paid_onboarding.service_access_terminated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids)) AND status = 'pending_review') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_APPLICATION_PENDING' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
      AND status IN ('scheduled', 'active', 'grace_period')) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTIVE_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_policy
  FROM public.platform_service_trial_policies WHERE is_current = true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_trials AS previous
    WHERE (previous.enterprise_identity_hash = v_enterprise_hash OR previous.tenant_id = ANY(v_identity_tenant_ids))
      AND previous.source = 'tenant_application'
      AND previous.status = 'rejected'
      AND previous.reviewed_at + make_interval(days =>
        coalesce((previous.policy_snapshot->>'reapply_cooldown_days')::integer,
          v_policy.reapply_cooldown_days)) > v_now
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REAPPLY_COOLDOWN' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_policy.allow_repeat AND EXISTS (
    SELECT 1 FROM public.tenant_service_trials
    WHERE (enterprise_identity_hash = v_enterprise_hash OR tenant_id = ANY(v_identity_tenant_ids))
      AND (granted_at IS NOT NULL OR converted_order_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tenant_service_trials (
    tenant_id, enterprise_identity_hash, source, trial_type, status,
    application_reason, expected_user_count, expected_project_count,
    contact_name, contact_phone, requested_at, requested_by_employee_id,
    scope_snapshot, policy_snapshot
  ) VALUES (
    p_tenant_id, v_enterprise_hash, 'tenant_application', 'standard', 'pending_review',
    btrim(p_application_reason), p_expected_user_count, p_expected_project_count,
    btrim(p_contact_name), p_contact_phone, v_now, p_actor_employee_id,
    v_policy.standard_scope,
    jsonb_build_object(
      'policy_id', v_policy.id, 'version', v_policy.version,
      'trial_days', v_policy.trial_days, 'grace_days', v_policy.grace_days,
      'max_trial_days', v_policy.max_trial_days,
      'max_grace_days', v_policy.max_grace_days,
      'max_schedule_days', v_policy.max_schedule_days,
      'max_extension_count', v_policy.max_extension_count,
      'max_extension_days', v_policy.max_extension_days,
      'reapply_cooldown_days', v_policy.reapply_cooldown_days,
      'allow_repeat', v_policy.allow_repeat,
      'reminder_days', to_jsonb(v_policy.reminder_days)
    )
  ) RETURNING * INTO v_trial;

  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, to_status,
    actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'application-submitted',
    'application_submitted', 'pending_review', p_actor_employee_id,
    jsonb_build_object(
      'expected_user_count', p_expected_user_count,
      'expected_project_count', p_expected_project_count
    ), v_now
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
