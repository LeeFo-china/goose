BEGIN;

CREATE OR REPLACE FUNCTION public.platform_service_trial_access_facts(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH access_clock AS MATERIALIZED (
    SELECT clock_timestamp() AS server_time
  ), tenant_fact AS (
    SELECT tenant.status AS tenant_status
    FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id
  ), contract_fact AS (
    SELECT jsonb_build_object(
      'id', contract.id,
      'service_start_at', contract.service_start_at,
      'service_end_at', contract.service_end_at
    ) AS contract
    FROM public.tenant_service_contracts AS contract
    CROSS JOIN access_clock
    WHERE contract.tenant_id = p_tenant_id
      AND contract.service_family = 'platform_technical_service'
      AND contract.status = 'active'
      AND contract.service_start_at <= access_clock.server_time
      AND contract.service_end_at > access_clock.server_time
    ORDER BY contract.service_end_at DESC, contract.id DESC
    LIMIT 1
  ), paid_onboarding_fact AS (
    SELECT jsonb_build_object(
      'id', service_order.id,
      'paid_at', service_order.paid_at
    ) AS paid_onboarding_order
    FROM public.tenant_service_orders AS service_order
    CROSS JOIN access_clock
    WHERE service_order.tenant_id = p_tenant_id
      AND service_order.payment_status IN (
        'paid', 'refund_reviewing', 'refunding', 'partially_refunded'
      )
      AND service_order.service_status NOT IN ('accepted', 'active')
      AND service_order.paid_at IS NOT NULL
      AND service_order.paid_at <= access_clock.server_time
      AND service_order.service_access_terminated_at IS NULL
    ORDER BY service_order.paid_at DESC, service_order.id DESC
    LIMIT 1
  ), subscription_fact AS (
    SELECT subscription.status AS legacy_subscription_status
    FROM public.tenant_billing_subscriptions AS subscription
    WHERE subscription.tenant_id = p_tenant_id
    ORDER BY subscription.created_at DESC, subscription.id DESC
    LIMIT 1
  ), trial_candidates AS MATERIALIZED (
    SELECT jsonb_build_object(
      'id', trial.id,
      'tenant_id', trial.tenant_id,
      'source', trial.source,
      'status', CASE
        WHEN access_clock.server_time < trial.trial_ends_at THEN 'active'
        ELSE 'grace_period'
      END,
      'starts_at', trial.starts_at,
      'trial_ends_at', trial.trial_ends_at,
      'grace_ends_at', trial.grace_ends_at,
      'scope_snapshot', trial.scope_snapshot
    ) AS current_trial
    FROM public.tenant_service_trials AS trial
    CROSS JOIN access_clock
    WHERE trial.tenant_id = p_tenant_id
      AND trial.status IN ('scheduled', 'active', 'grace_period')
      AND access_clock.server_time >= trial.starts_at
      AND access_clock.server_time < trial.grace_ends_at
    ORDER BY trial.created_at DESC, trial.id DESC
    LIMIT 2
  ), trial_fact AS (
    SELECT
      count(*) AS candidate_count,
      (jsonb_agg(current_trial)->0) AS current_trial
    FROM trial_candidates
  ), latest_trial_fact AS (
    SELECT jsonb_build_object(
      'id', trial.id,
      'tenant_id', trial.tenant_id,
      'status', CASE
        WHEN trial.status IN ('scheduled', 'active', 'grace_period')
          AND access_clock.server_time < trial.starts_at THEN 'scheduled'
        WHEN trial.status IN ('scheduled', 'active', 'grace_period')
          AND access_clock.server_time < trial.trial_ends_at THEN 'active'
        WHEN trial.status IN ('scheduled', 'active', 'grace_period')
          AND access_clock.server_time < trial.grace_ends_at THEN 'grace_period'
        WHEN trial.status IN ('scheduled', 'active', 'grace_period') THEN 'expired'
        ELSE trial.status
      END,
      'starts_at', trial.starts_at,
      'trial_ends_at', trial.trial_ends_at,
      'grace_ends_at', trial.grace_ends_at
    ) AS latest_trial
    FROM public.tenant_service_trials AS trial
    CROSS JOIN access_clock
    WHERE trial.tenant_id = p_tenant_id
    ORDER BY trial.created_at DESC, trial.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'server_time', access_clock.server_time,
    'tenant_id', p_tenant_id,
    'tenant_status', (SELECT tenant_status FROM tenant_fact),
    'contract', (SELECT contract FROM contract_fact),
    'paid_onboarding_order', (
      SELECT paid_onboarding_order FROM paid_onboarding_fact
    ),
    'legacy_subscription_status', (
      SELECT legacy_subscription_status FROM subscription_fact
    ),
    'current_trial', (
      SELECT CASE
        WHEN candidate_count <= 1 THEN current_trial
        ELSE jsonb_build_object('ambiguous', true)
      END
      FROM trial_fact
    ),
    'latest_trial', (SELECT latest_trial FROM latest_trial_fact)
  )
  FROM access_clock;
$$;

REVOKE ALL ON FUNCTION public.platform_service_trial_access_facts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_access_facts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_access_facts(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_access_facts(uuid) TO service_role;

COMMIT;
