CREATE OR REPLACE FUNCTION public.upsert_platform_payment_secret_setting(
  p_setting_key text,
  p_group_code text,
  p_name text,
  p_description text,
  p_value_type text,
  p_value_text text,
  p_status text,
  p_changed_by_employee_id uuid
)
RETURNS public.system_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_setting public.system_settings%ROWTYPE;
BEGIN
  IF NOT (
    p_setting_key = ANY (ARRAY[
      'PLATFORM_WECHAT_PAY_SECRET_BUNDLE',
      'PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SYSTEM_SETTING_PAYMENT_SECRET_KEY_INVALID';
  END IF;

  IF NULLIF(btrim(p_group_code), '') IS NULL
     OR p_group_code <> 'payment'
     OR NULLIF(btrim(p_name), '') IS NULL
     OR NULLIF(btrim(p_description), '') IS NULL
     OR NULLIF(btrim(p_value_text), '') IS NULL
     OR p_value_text !~
       '^enc:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:([A-Za-z0-9_-]{4})*([A-Za-z0-9_-]{2,4})$'
     OR p_status <> 'active'
     OR (
       p_setting_key = 'WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN'
       AND p_value_type <> 'string'
     )
     OR (
       p_setting_key <> 'WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN'
       AND p_value_type <> 'json'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SYSTEM_SETTING_PAYMENT_SECRET_METADATA_INVALID';
  END IF;

  INSERT INTO public.system_settings (
    tenant_id,
    key,
    group_code,
    name,
    description,
    value_type,
    value_text,
    is_secret,
    status,
    updated_by_employee_id
  )
  VALUES (
    NULL,
    p_setting_key,
    p_group_code,
    p_name,
    p_description,
    p_value_type,
    p_value_text,
    TRUE,
    p_status,
    p_changed_by_employee_id
  )
  ON CONFLICT (key) WHERE tenant_id IS NULL
  DO UPDATE SET
    group_code = EXCLUDED.group_code,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    value_type = EXCLUDED.value_type,
    value_text = EXCLUDED.value_text,
    is_secret = TRUE,
    status = EXCLUDED.status,
    updated_by_employee_id = EXCLUDED.updated_by_employee_id
  RETURNING * INTO v_setting;

  INSERT INTO public.system_setting_change_logs (
    tenant_id,
    setting_key,
    old_value_text,
    new_value_text,
    changed_by_employee_id,
    created_at
  )
  VALUES (
    NULL,
    v_setting.key,
    NULL,
    NULL,
    p_changed_by_employee_id,
    clock_timestamp()
  );

  RETURN v_setting;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_platform_payment_secret_setting(
  text, text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_platform_payment_secret_setting(
  text, text, text, text, text, text, text, uuid
) TO service_role;
