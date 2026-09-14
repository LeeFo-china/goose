-- Execute only against an isolated database with all migrations applied.
BEGIN;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('88888888-8888-4888-8888-888888888888', 'rendering pilot', 'rendering-pilot-settings'),
  ('88888888-8888-4888-8888-888888888889', 'inactive rendering pilot', 'rendering-pilot-inactive');
UPDATE public.tenants SET status = 'suspended'
WHERE id = '88888888-8888-4888-8888-888888888889';
INSERT INTO public.employees (id, tenant_id, name, status) VALUES
  ('88888888-8888-4888-8888-888888888881',
   '88888888-8888-4888-8888-888888888888', 'pilot operator', 'active');

DO $test$
DECLARE
  v_tenant uuid := '88888888-8888-4888-8888-888888888888';
  v_inactive uuid := '88888888-8888-4888-8888-888888888889';
  v_actor uuid := '88888888-8888-4888-8888-888888888881';
  v_result jsonb;
BEGIN
  IF NOT has_function_privilege('service_role',
    'public.set_tenant_customer_rendering_settings(uuid,boolean,integer,bigint,bigint,integer,uuid,text)',
    'EXECUTE') OR has_function_privilege('authenticated',
    'public.set_tenant_customer_rendering_settings(uuid,boolean,integer,bigint,bigint,integer,uuid,text)',
    'EXECUTE') OR has_table_privilege('service_role', 'public.tenant_customer_rendering_settings', 'UPDATE')
  THEN RAISE EXCEPTION 'settings privilege boundary'; END IF;

  v_result := public.set_tenant_customer_rendering_settings(v_tenant, false, 2, 200, 100,
    0, v_actor, 'prepare controlled pilot');
  IF v_result->>'decision' <> 'updated' OR (v_result->'setting'->>'version')::integer <> 1
    OR (v_result->'setting'->>'enabled')::boolean
  THEN RAISE EXCEPTION 'disabled initial save: %', v_result; END IF;

  v_result := public.set_tenant_customer_rendering_settings(v_tenant, true, 2, 200, 100,
    0, v_actor, 'stale pilot enable');
  IF v_result->>'decision' <> 'stale' THEN RAISE EXCEPTION 'stale write: %', v_result; END IF;
  v_result := public.set_tenant_customer_rendering_settings(v_tenant, true, 2, 99, 100,
    1, v_actor, 'invalid pilot budget');
  IF v_result->>'decision' <> 'invalid_request' THEN RAISE EXCEPTION 'invalid budget: %', v_result; END IF;
  v_result := public.set_tenant_customer_rendering_settings(v_inactive, true, 2, 200, 100,
    0, v_actor, 'inactive pilot');
  IF v_result->>'decision' <> 'tenant_inactive' THEN RAISE EXCEPTION 'inactive tenant: %', v_result; END IF;
  v_result := public.set_tenant_customer_rendering_settings(v_tenant, true, 2, 200, 100,
    1, v_actor, 'enable controlled pilot');
  IF v_result->>'decision' <> 'updated' OR (v_result->'setting'->>'version')::integer <> 2
    OR NOT (v_result->'setting'->>'enabled')::boolean
  THEN RAISE EXCEPTION 'explicit enable: %', v_result; END IF;

  IF (SELECT count(*) FROM public.platform_audit_logs
      WHERE resource_type = 'tenant_customer_rendering_settings' AND resource_id = v_tenant) <> 2
    OR (SELECT count(*) FROM public.tenant_customer_rendering_settings
      WHERE tenant_id = v_tenant AND enabled AND version = 2) <> 1
  THEN RAISE EXCEPTION 'atomic setting/audit mismatch'; END IF;
END;
$test$;

ROLLBACK;
