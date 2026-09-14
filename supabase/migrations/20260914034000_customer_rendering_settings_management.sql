-- Controlled, audited tenant pilot settings. No tenant is enabled by this migration.
-- Rollback: disable the pilot through the superadmin API; retain settings and audit.
-- Structural rollback requires a reviewed forward migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.tenant_customer_rendering_settings
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1);

CREATE FUNCTION public.set_tenant_customer_rendering_settings(
  p_tenant_id uuid, p_enabled boolean, p_daily_task_limit integer,
  p_daily_budget_fen bigint, p_per_job_reserve_fen bigint,
  p_expected_version integer, p_operator_employee_id uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_existing public.tenant_customer_rendering_settings%ROWTYPE;
  v_after public.tenant_customer_rendering_settings%ROWTYPE;
  v_exists boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_enabled IS NULL OR p_operator_employee_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646
    OR p_daily_task_limit IS NULL OR p_daily_task_limit NOT BETWEEN 1 AND 10000
    OR p_daily_budget_fen IS NULL OR p_daily_budget_fen NOT BETWEEN 1 AND 100000000
    OR p_per_job_reserve_fen IS NULL OR p_per_job_reserve_fen NOT BETWEEN 1 AND 100000000
    OR p_per_job_reserve_fen > p_daily_budget_fen
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 240
    OR p_reason ~ '[[:cntrl:]]'
  THEN RETURN jsonb_build_object('decision', 'invalid_request'); END IF;

  -- Tenant lock serializes concurrent first writes before a settings row exists.
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  IF p_enabled AND v_tenant.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('decision', 'tenant_inactive');
  END IF;

  SELECT * INTO v_existing FROM public.tenant_customer_rendering_settings
    WHERE tenant_id = p_tenant_id FOR UPDATE;
  v_exists := FOUND;
  IF v_exists THEN
    IF v_existing.version <> p_expected_version THEN
      RETURN jsonb_build_object('decision', 'stale');
    END IF;
    UPDATE public.tenant_customer_rendering_settings
      SET enabled = p_enabled, daily_task_limit = p_daily_task_limit,
        daily_budget_fen = p_daily_budget_fen,
        per_job_reserve_fen = p_per_job_reserve_fen, version = version + 1
      WHERE tenant_id = p_tenant_id RETURNING * INTO v_after;
  ELSE
    IF p_expected_version <> 0 THEN RETURN jsonb_build_object('decision', 'stale'); END IF;
    INSERT INTO public.tenant_customer_rendering_settings
      (tenant_id, enabled, daily_task_limit, daily_budget_fen, per_job_reserve_fen)
    VALUES (p_tenant_id, p_enabled, p_daily_task_limit, p_daily_budget_fen, p_per_job_reserve_fen)
    RETURNING * INTO v_after;
  END IF;

  -- Audit and setting commit atomically; no best-effort log after enabling.
  INSERT INTO public.platform_audit_logs
    (action, actor_employee_id, target_tenant_id, resource_type,
      resource_id, status, summary, metadata)
  VALUES ('customer_rendering_settings_update', p_operator_employee_id, p_tenant_id,
    'tenant_customer_rendering_settings', p_tenant_id, 'success',
    '客户生图试点设置更新', jsonb_build_object(
      'reason', btrim(p_reason),
      'previous', CASE WHEN v_exists THEN to_jsonb(v_existing) ELSE NULL::jsonb END,
      'current', to_jsonb(v_after)));

  RETURN jsonb_build_object('decision', 'updated', 'setting', to_jsonb(v_after));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_tenant_customer_rendering_settings(
  uuid, boolean, integer, bigint, bigint, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_customer_rendering_settings(
  uuid, boolean, integer, bigint, bigint, integer, uuid, text) TO service_role;

COMMENT ON FUNCTION public.set_tenant_customer_rendering_settings(
  uuid, boolean, integer, bigint, bigint, integer, uuid, text)
  IS 'Service-role-only superadmin command; atomically versions tenant rendering pilot settings and platform audit';

COMMIT;
