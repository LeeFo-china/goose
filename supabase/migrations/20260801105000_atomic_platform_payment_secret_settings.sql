CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_config_id uuid;
  v_references text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    v_references := ARRAY[
      NEW.key,
      'secret://' || NEW.key,
      'setting://' || NEW.key
    ];
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL THEN
      RETURN OLD;
    END IF;
    v_references := ARRAY[
      OLD.key,
      'secret://' || OLD.key,
      'setting://' || OLD.key
    ];
  ELSE
    IF ROW(OLD.value_text, OLD.key, OLD.tenant_id)
      IS NOT DISTINCT FROM ROW(NEW.value_text, NEW.key, NEW.tenant_id)
    THEN
      RETURN NEW;
    END IF;

    IF OLD.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        OLD.key,
        'secret://' || OLD.key,
        'setting://' || OLD.key
      ];
    END IF;
    IF NEW.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        NEW.key,
        'secret://' || NEW.key,
        'setting://' || NEW.key
      ];
    END IF;
  END IF;

  FOR v_config_id IN
    SELECT config.id
    FROM public.platform_payment_configs AS config
    WHERE config.provider = 'wechat_pay'
      AND config.encrypted_config_ref = ANY(v_references)
    ORDER BY config.id
    FOR UPDATE OF config
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS recharge_order
      WHERE recharge_order.payment_config_id = v_config_id
        AND recharge_order.channel = 'wechat_pay'
        AND recharge_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_payment_configs AS tenant_config
      JOIN public.wechat_payment_orders AS project_order
        ON project_order.payment_config_id = tenant_config.id
      WHERE tenant_config.platform_payment_config_id = v_config_id
        AND project_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_addon_orders AS addon_order
      WHERE addon_order.payment_config_id = v_config_id
        AND addon_order.channel = 'wechat_pay'
        AND addon_order.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    UPDATE public.platform_payment_configs AS config
    SET recharge_guard_version = config.recharge_guard_version + 1
    WHERE config.id = v_config_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret
ON public.system_settings;
CREATE TRIGGER tr_guard_pending_recharge_payment_secret
BEFORE UPDATE OF value_text, key, tenant_id
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret_insert
ON public.system_settings;
CREATE TRIGGER tr_guard_pending_recharge_payment_secret_insert
BEFORE INSERT
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();

CREATE OR REPLACE FUNCTION public.upsert_platform_payment_secret_setting(
  p_setting_key text,
  p_group_code text,
  p_name text,
  p_description text,
  p_value_type text,
  p_value_text text,
  p_status text,
  p_changed_by_employee_id uuid,
  p_expected_updated_at timestamptz
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

  -- Lock order: setting-key advisory, then payment-config rows in the guard,
  -- then the branding config advisory in the virtual-secret guard.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('platform_payment_secret:' || p_setting_key, 20260801)
  );

  UPDATE public.system_settings
  SET
    group_code = p_group_code,
    name = p_name,
    description = p_description,
    value_type = p_value_type,
    value_text = p_value_text,
    is_secret = TRUE,
    status = p_status,
    updated_by_employee_id = p_changed_by_employee_id
  WHERE tenant_id IS NULL
    AND key = p_setting_key
    AND p_expected_updated_at IS NOT NULL
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_setting;

  IF NOT FOUND THEN
    IF p_expected_updated_at IS NOT NULL OR EXISTS (
      SELECT 1
      FROM public.system_settings AS existing
      WHERE existing.tenant_id IS NULL
        AND existing.key = p_setting_key
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT';
    END IF;

    BEGIN
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
      RETURNING * INTO v_setting;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT';
    END;
  END IF;

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
  text, text, text, text, text, text, text, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_platform_payment_secret_setting(
  text, text, text, text, text, text, text, uuid, timestamptz
) TO service_role;
