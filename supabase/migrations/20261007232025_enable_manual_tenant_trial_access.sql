BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Release activation: apply only after the API/Admin candidate e8691d469
-- and the six manual-tenant-trial migrations have been deployed and verified.
-- Self-service applications keep their existing setting.
-- Rollback: use a forward migration to set this key back to false and append
-- a change log. Keep trial/audit history; existing trial-only tenants will be
-- blocked while the access switch is off, so prefer a forward application fix.
-- Production migrations run as supabase_admin, whose default function ACL
-- directly grants anon/authenticated EXECUTE. Revoking PUBLIC alone does not
-- remove those grants. Close them before enabling the entry point.
REVOKE ALL ON FUNCTION public.create_platform_tenant_with_trial(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, numeric, timestamptz, text, text,
  text, text, uuid, text, text, uuid, integer, text, uuid, boolean
) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_setting public.system_settings%ROWTYPE;
  v_create_function regprocedure := 'public.create_platform_tenant_with_trial(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,timestamptz,text,text,text,text,uuid,text,text,uuid,integer,text,uuid,boolean)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_create_function, 'EXECUTE')
    OR has_function_privilege('authenticated', v_create_function, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_create_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'MANUAL_TENANT_TRIAL_FUNCTION_ACL_INVALID';
  END IF;

  IF to_regprocedure('public.platform_service_trial_access_facts_batch(uuid[])') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
        AND column_name = 'service_access_policy'
    )
  THEN
    RAISE EXCEPTION 'MANUAL_TENANT_TRIAL_MIGRATIONS_REQUIRED';
  END IF;

  SELECT * INTO STRICT v_setting
  FROM public.system_settings
  WHERE tenant_id IS NULL AND key = 'PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED'
  FOR UPDATE;

  IF v_setting.status <> 'active' OR v_setting.value_type <> 'boolean'
    OR v_setting.is_secret OR v_setting.value_text NOT IN ('true', 'false')
    OR v_setting.value_text IS NULL
  THEN
    RAISE EXCEPTION 'MANUAL_TENANT_TRIAL_ACCESS_SETTING_INVALID';
  END IF;

  IF v_setting.value_text = 'false' THEN
    INSERT INTO public.system_setting_change_logs (
      setting_key, old_value_text, new_value_text,
      changed_by_employee_id, tenant_id
    ) VALUES (v_setting.key, 'false', 'true', NULL, NULL);

    UPDATE public.system_settings
    SET value_text = 'true', updated_by_employee_id = NULL, updated_at = now()
    WHERE tenant_id IS NULL AND key = v_setting.key;
  END IF;
END;
$$;

COMMIT;
