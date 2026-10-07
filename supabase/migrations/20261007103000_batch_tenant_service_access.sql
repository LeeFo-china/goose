BEGIN;

CREATE OR REPLACE FUNCTION public.platform_service_trial_access_facts_batch(p_tenant_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_tenant_ids IS NULL OR cardinality(p_tenant_ids) > 100
    OR array_position(p_tenant_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_ACCESS_BATCH_INVALID' USING ERRCODE = '22023';
  END IF;
  -- All facts share one clock and are restricted to the current page (max 100).
  WITH access_clock AS MATERIALIZED (
    SELECT clock_timestamp() AS server_time
  ), contract_fact AS (
    SELECT DISTINCT ON (tenant_id) tenant_id, jsonb_build_object(
      'id', id, 'service_start_at', service_start_at, 'service_end_at', service_end_at
    ) AS fact
    FROM public.tenant_service_contracts CROSS JOIN access_clock
    WHERE tenant_id = ANY(p_tenant_ids) AND service_family = 'platform_technical_service'
      AND status = 'active' AND service_start_at <= server_time AND service_end_at > server_time
    ORDER BY tenant_id, service_end_at DESC, id DESC
  ), paid_fact AS (
    SELECT DISTINCT ON (tenant_id) tenant_id, jsonb_build_object('id', id, 'paid_at', paid_at) AS fact
    FROM public.tenant_service_orders CROSS JOIN access_clock
    WHERE tenant_id = ANY(p_tenant_ids)
      AND payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
      AND service_status NOT IN ('accepted', 'active') AND paid_at <= server_time
      AND service_access_terminated_at IS NULL
    ORDER BY tenant_id, paid_at DESC, id DESC
  ), subscription_fact AS (
    SELECT DISTINCT ON (tenant_id) tenant_id, status
    FROM public.tenant_billing_subscriptions WHERE tenant_id = ANY(p_tenant_ids)
    ORDER BY tenant_id, created_at DESC, id DESC
  ), current_trial_fact AS (
    SELECT tenant_id, CASE WHEN count(*) > 1 THEN jsonb_build_object('ambiguous', true)
      ELSE (jsonb_agg(jsonb_build_object(
        'id', id, 'tenant_id', tenant_id, 'source', source,
        'status', CASE WHEN server_time < trial_ends_at THEN 'active' ELSE 'grace_period' END,
        'starts_at', starts_at, 'trial_ends_at', trial_ends_at,
        'grace_ends_at', grace_ends_at, 'scope_snapshot', scope_snapshot
      ))->0) END AS fact
    FROM public.tenant_service_trials CROSS JOIN access_clock
    WHERE tenant_id = ANY(p_tenant_ids) AND status IN ('scheduled', 'active', 'grace_period')
      AND server_time >= starts_at AND server_time < grace_ends_at
    GROUP BY tenant_id
  ), latest_trial_fact AS (
    SELECT DISTINCT ON (tenant_id) tenant_id, jsonb_build_object(
      'id', id, 'tenant_id', tenant_id, 'version', version,
      'status', CASE
        WHEN status IN ('scheduled', 'active', 'grace_period') AND server_time < starts_at THEN 'scheduled'
        WHEN status IN ('scheduled', 'active', 'grace_period') AND server_time < trial_ends_at THEN 'active'
        WHEN status IN ('scheduled', 'active', 'grace_period') AND server_time < grace_ends_at THEN 'grace_period'
        WHEN status IN ('scheduled', 'active', 'grace_period') THEN 'expired'
        ELSE status END,
      'starts_at', starts_at, 'trial_ends_at', trial_ends_at, 'grace_ends_at', grace_ends_at
    ) AS fact
    FROM public.tenant_service_trials CROSS JOIN access_clock
    WHERE tenant_id = ANY(p_tenant_ids)
    ORDER BY tenant_id, created_at DESC, id DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'server_time', access_clock.server_time, 'tenant_id', tenant.id,
    'tenant_status', tenant.status, 'service_access_policy', tenant.service_access_policy,
    'contract', contract.fact, 'paid_onboarding_order', paid.fact,
    'legacy_subscription_status', subscription.status,
    'current_trial', current_trial.fact, 'latest_trial', latest_trial.fact
  )), '[]'::jsonb) INTO v_result
  FROM public.tenants AS tenant CROSS JOIN access_clock
  LEFT JOIN contract_fact AS contract ON contract.tenant_id = tenant.id
  LEFT JOIN paid_fact AS paid ON paid.tenant_id = tenant.id
  LEFT JOIN subscription_fact AS subscription ON subscription.tenant_id = tenant.id
  LEFT JOIN current_trial_fact AS current_trial ON current_trial.tenant_id = tenant.id
  LEFT JOIN latest_trial_fact AS latest_trial ON latest_trial.tenant_id = tenant.id
  WHERE tenant.id = ANY(p_tenant_ids);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_trial_access_facts_batch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_access_facts_batch(uuid[]) TO service_role;

-- Keep route enforcement and list projections on the same SQL facts.
CREATE OR REPLACE FUNCTION public.platform_service_trial_access_facts(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.platform_service_trial_access_facts_batch(ARRAY[p_tenant_id])->0;
$$;

COMMIT;
