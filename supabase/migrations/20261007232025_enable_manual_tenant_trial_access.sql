BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Release activation: apply only after the API/Admin candidate e8691d469
-- and the six manual-tenant-trial migrations have been deployed and verified.
-- Self-service applications keep their existing setting.
-- Rollback: use a forward migration to set this key back to false and append
-- a change log. Keep trial/audit history; existing trial-only tenants will be
-- blocked while the access switch is off, so prefer a forward application fix.
DO $$
DECLARE
  v_setting public.system_settings%ROWTYPE;
BEGIN
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
