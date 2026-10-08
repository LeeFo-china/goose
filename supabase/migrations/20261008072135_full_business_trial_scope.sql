BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Compatibility release only: no policy or existing scope facts are expanded.
-- Deploy the runtime capability catalogue before writing any expanded scopes.
-- Rollback is forward-only after expanded facts exist: retain scope/audit history
-- and disable the new entry points or narrow scopes through the audited command.
CREATE OR REPLACE FUNCTION public.platform_service_trial_scope_valid(p_scope jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capability jsonb;
  v_count integer := 0;
  v_distinct_count integer;
BEGIN
  IF p_scope IS NULL OR jsonb_typeof(p_scope) IS DISTINCT FROM 'object'
    OR p_scope->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_scope->'capabilities') IS DISTINCT FROM 'array'
    OR (SELECT count(*) FROM jsonb_object_keys(p_scope)) <> 2
    OR NOT (p_scope ? 'version' AND p_scope ? 'capabilities')
    OR pg_column_size(p_scope) > 4096
  THEN RETURN false; END IF;
  FOR v_capability IN SELECT jsonb_array_elements(p_scope->'capabilities')
  LOOP
    v_count := v_count + 1;
    IF jsonb_typeof(v_capability) IS DISTINCT FROM 'string'
      OR (v_capability #>> '{}') NOT IN (
        'core.projects', 'core.customers', 'core.employees',
        'core.workflows', 'core.files', 'core.notifications',
        'business.marketing', 'business.finance', 'business.procurement',
        'business.inventory', 'business.content', 'business.ai', 'business.settings'
      )
    THEN RETURN false; END IF;
  END LOOP;
  SELECT count(DISTINCT capability)::integer INTO v_distinct_count
  FROM jsonb_array_elements_text(p_scope->'capabilities') AS capability;
  RETURN v_count BETWEEN 1 AND 13 AND v_distinct_count = v_count;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

ALTER TABLE public.tenant_service_trial_events
  DROP CONSTRAINT tenant_service_trial_events_event_type_check;
ALTER TABLE public.tenant_service_trial_events
  ADD CONSTRAINT tenant_service_trial_events_event_type_check CHECK ((
    event_type IN (
      'application_submitted', 'application_withdrawn', 'application_approved',
      'application_rejected', 'trial_granted', 'trial_activated',
      'trial_grace_started', 'trial_expired', 'trial_extended',
      'trial_revoked', 'trial_assigned', 'formal_purchase_attributed',
      'conversion_anomaly', 'trial_follow_up_created', 'trial_follow_up_canceled',
      'trial_scope_updated'
    )
  ) IS TRUE);

CREATE OR REPLACE FUNCTION public.platform_service_trial_update_scope(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_scope jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_before_scope jsonb;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_idempotency_key IS NULL OR NULLIF(btrim(p_reason), '') IS NULL
    OR char_length(p_reason) > 1000
    OR NOT public.platform_service_trial_scope_valid(p_scope)
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;

  -- Recheck the current platform identity/permissions even for a cached command.
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id, ARRAY['platform.service_trial.manage']
  );
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'update_scope', 'trial_id', p_trial_id,
    'expected_version', p_expected_version, 'scope', p_scope, 'reason', btrim(p_reason)
  )::text, 'sha256');
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Same order and lock namespace as grant/extend/revoke: actor, enterprise,
  -- tenant, then trial row. Provisional identities use their existing opaque hash.
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

  SELECT * INTO v_trial FROM public.tenant_service_trials
  WHERE id = p_trial_id AND tenant_id = v_identity.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  -- Match the current stored version before lifecycle normalization, as extend
  -- does. Read the wall clock AFTER waiting for all locks, including the row lock.
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  v_now := clock_timestamp();
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.status NOT IN ('scheduled', 'active', 'grace_period') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_before_scope := v_trial.scope_snapshot;
  UPDATE public.tenant_service_trials SET
    scope_snapshot = p_scope, version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    reason, actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'update-scope:' || v_trial.version::text,
    'trial_scope_updated', v_trial.status, v_trial.status, btrim(p_reason),
    p_actor_employee_id,
    jsonb_build_object('before_scope', v_before_scope, 'after_scope', v_trial.scope_snapshot),
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

CREATE OR REPLACE FUNCTION public.create_platform_tenant_with_trial_scope(
  p_name text,
  p_slug text,
  p_status text DEFAULT 'active',
  p_address text DEFAULT NULL,
  p_address_title text DEFAULT NULL,
  p_address_poi_id text DEFAULT NULL,
  p_address_province text DEFAULT NULL,
  p_address_city text DEFAULT NULL,
  p_address_district text DEFAULT NULL,
  p_address_adcode text DEFAULT NULL,
  p_address_latitude numeric DEFAULT NULL,
  p_address_longitude numeric DEFAULT NULL,
  p_address_source text DEFAULT NULL,
  p_address_confidence numeric DEFAULT NULL,
  p_address_confirmed_at timestamptz DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_admin_name text DEFAULT NULL,
  p_admin_phone text DEFAULT NULL,
  p_admin_auth_user_id uuid DEFAULT NULL,
  p_admin_department_code text DEFAULT 'EXEC_OFFICE',
  p_admin_post_code text DEFAULT 'SYSTEM_ADMIN',
  p_operator_employee_id uuid DEFAULT NULL,
  p_trial_days integer DEFAULT NULL,
  p_trial_reason text DEFAULT NULL,
  p_trial_idempotency_key uuid DEFAULT NULL,
  p_allow_override boolean DEFAULT false,
  p_trial_scope jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_created jsonb;
  v_grant jsonb;
BEGIN
  IF p_operator_employee_id IS NULL OR p_trial_days IS NULL
    OR NULLIF(btrim(p_trial_reason), '') IS NULL OR char_length(p_trial_reason) > 1000
    OR p_trial_idempotency_key IS NULL OR p_allow_override IS NULL
    OR NOT public.platform_service_trial_scope_valid(p_trial_scope)
  THEN
    RAISE EXCEPTION 'TENANT_CREATION_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_operator_employee_id, ARRAY['platform.tenant.manage', 'platform.service_trial.manage']
  );
  -- Preserve all organization/admin/workflow creation behavior in the old RPC.
  -- Its trial branch is explicitly disabled: the only grant uses the custom scope.
  v_created := public.create_platform_tenant_with_trial(
    p_name => p_name,
    p_slug => p_slug,
    p_status => p_status,
    p_address => p_address,
    p_address_title => p_address_title,
    p_address_poi_id => p_address_poi_id,
    p_address_province => p_address_province,
    p_address_city => p_address_city,
    p_address_district => p_address_district,
    p_address_adcode => p_address_adcode,
    p_address_latitude => p_address_latitude,
    p_address_longitude => p_address_longitude,
    p_address_source => p_address_source,
    p_address_confidence => p_address_confidence,
    p_address_confirmed_at => p_address_confirmed_at,
    p_contact_name => p_contact_name,
    p_contact_phone => p_contact_phone,
    p_admin_name => p_admin_name,
    p_admin_phone => p_admin_phone,
    p_admin_auth_user_id => p_admin_auth_user_id,
    p_admin_department_code => p_admin_department_code,
    p_admin_post_code => p_admin_post_code,
    p_operator_employee_id => p_operator_employee_id,
    p_trial_days => NULL,
    p_trial_reason => NULL,
    p_trial_idempotency_key => NULL,
    p_allow_override => p_allow_override
  );
  v_grant := public.platform_service_trial_grant(
    p_tenant_id => (v_created->'tenant'->>'id')::uuid,
    p_actor_employee_id => p_operator_employee_id,
    p_trial_type => 'standard',
    p_scope => p_trial_scope,
    p_reason => p_trial_reason,
    p_idempotency_key => p_trial_idempotency_key,
    p_trial_days => p_trial_days,
    p_grace_days => 7,
    p_starts_at => NULL,
    p_assignee_employee_id => NULL,
    p_allow_override => p_allow_override
  );
  RETURN v_created || jsonb_build_object('trial', jsonb_build_object(
    'id', v_grant->'trial_snapshot'->>'id',
    'status', v_grant->'trial_snapshot'->>'status',
    'trial_ends_at', v_grant->'trial_snapshot'->>'trial_ends_at',
    'grace_ends_at', v_grant->'trial_snapshot'->>'grace_ends_at'
  ));
END;
$$;

-- Explicitly revoke direct default ACL grants as well as PUBLIC (supabase_admin
-- can have anon/authenticated defaults). Keep internal validation non-callable.
REVOKE ALL ON FUNCTION public.platform_service_trial_scope_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_update_scope(uuid, uuid, integer, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_update_scope(uuid, uuid, integer, uuid, jsonb, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_platform_tenant_with_trial_scope(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, numeric, timestamptz, text, text,
  text, text, uuid, text, text, uuid, integer, text, uuid, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_tenant_with_trial_scope(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, numeric, timestamptz, text, text,
  text, text, uuid, text, text, uuid, integer, text, uuid, boolean, jsonb
) TO service_role;

COMMIT;
