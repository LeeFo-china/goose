-- Read-only, tenant-scoped daily usage for the platform rendering quota page.
-- Rollback: revoke service_role execution through a forward migration, then drop
-- this function after deployed API versions no longer call it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.get_tenant_customer_rendering_daily_usage(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_budget_date date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_task_count integer;
  v_budget_used_fen bigint;
BEGIN
  SELECT count(*)::integer,
    coalesce(sum(coalesce(actual_cost_fen, reserved_cost_fen)), 0)::bigint
  INTO v_task_count, v_budget_used_fen
  FROM public.customer_rendering_jobs
  WHERE tenant_id = p_tenant_id AND budget_date = v_budget_date;

  RETURN jsonb_build_object(
    'budget_date', v_budget_date,
    'task_count', v_task_count,
    'budget_used_fen', v_budget_used_fen
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tenant_customer_rendering_daily_usage(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_customer_rendering_daily_usage(uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_tenant_customer_rendering_daily_usage(uuid)
  IS 'Service-role-only tenant daily rendering budget aggregate, matching admission accounting';

COMMIT;
