-- Bind platform payment validation to the exact opaque secret bundle revision.

ALTER TABLE public.platform_payment_configs
  ADD COLUMN IF NOT EXISTS secret_bundle_revision text NULL;

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_secret_bundle_revision_not_blank;

ALTER TABLE public.platform_payment_configs
  ADD CONSTRAINT platform_payment_configs_secret_bundle_revision_not_blank
    CHECK (secret_bundle_revision IS NULL
      OR btrim(secret_bundle_revision) <> '');

COMMENT ON COLUMN public.platform_payment_configs.secret_bundle_revision
IS 'An opaque revision binding validation to a secret bundle version; never secret material.';

CREATE INDEX IF NOT EXISTS wechat_payment_orders_pending_payment_config_idx
ON public.wechat_payment_orders(payment_config_id)
WHERE status = 'pending';

-- Keep secret revision rotation in the same row-lock protocol as recharge
-- order creation. A pending order wins the race by blocking the rotation;
-- a completed rotation wins by advancing the creator CAS version.
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF ROW(
    OLD.provider,
    OLD.profile_code,
    OLD.principal_type,
    OLD.merchant_mode,
    OLD.merchant_id,
    OLD.sub_merchant_id,
    OLD.app_id,
    OLD.sub_app_id,
    OLD.serial_no,
    OLD.encrypted_config_ref,
    OLD.secret_bundle_revision,
    OLD.notify_url,
    OLD.enabled_channels,
    OLD.status,
    OLD.validation_status,
    OLD.last_validated_at
  ) IS DISTINCT FROM ROW(
    NEW.provider,
    NEW.profile_code,
    NEW.principal_type,
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref,
    NEW.secret_bundle_revision,
    NEW.notify_url,
    NEW.enabled_channels,
    NEW.status,
    NEW.validation_status,
    NEW.last_validated_at
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS orders
      WHERE orders.payment_config_id = OLD.id
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_payment_configs AS tenant_config
      JOIN public.wechat_payment_orders AS project_order
        ON project_order.payment_config_id = tenant_config.id
      WHERE tenant_config.platform_payment_config_id = OLD.id
        AND project_order.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    NEW.recharge_guard_version := OLD.recharge_guard_version + 1;
  ELSE
    NEW.recharge_guard_version := OLD.recharge_guard_version;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM authenticated;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_config
ON public.platform_payment_configs;

CREATE TRIGGER tr_guard_pending_recharge_payment_config
BEFORE UPDATE OF provider, profile_code, principal_type, merchant_mode,
  merchant_id, sub_merchant_id, app_id, sub_app_id, serial_no,
  encrypted_config_ref, secret_bundle_revision, notify_url, enabled_channels,
  status, validation_status, last_validated_at
ON public.platform_payment_configs
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_config();

-- Secret-setting mutations follow the same central-first lock order as order
-- creation. This keeps the loaded bundle stable until a pending order exits.
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
  v_references text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
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
    SELECT platform_config.id
    FROM public.platform_payment_configs AS platform_config
    WHERE platform_config.provider = 'wechat_pay'
      AND platform_config.encrypted_config_ref = ANY(v_references)
    ORDER BY platform_config.id
    FOR UPDATE OF platform_config
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
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    UPDATE public.platform_payment_configs AS platform_config
    SET recharge_guard_version =
      platform_config.recharge_guard_version + 1
    WHERE platform_config.id = v_config_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM authenticated;

CREATE OR REPLACE FUNCTION public.wechat_pay_create_pending_service_provider_order(
  p_tenant_id uuid,
  p_payment_config_id uuid,
  p_platform_payment_config_id uuid,
  p_expected_platform_guard_version bigint,
  p_expected_tenant_config_updated_at timestamptz,
  p_project_id uuid,
  p_workflow_instance_id uuid,
  p_workflow_task_id uuid,
  p_receivable_plan_id uuid,
  p_out_trade_no text,
  p_amount numeric,
  p_payer_openid text,
  p_created_by_employee_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.wechat_payment_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform_config public.platform_payment_configs%ROWTYPE;
  v_tenant_config public.tenant_payment_configs%ROWTYPE;
  v_platform_channels text[];
  v_tenant_channels text[];
  v_order public.wechat_payment_orders%ROWTYPE;
BEGIN
  -- All participating mutations take the central lock before tenant state.
  SELECT platform_config.*
  INTO v_platform_config
  FROM public.platform_payment_configs AS platform_config
  WHERE platform_config.id = p_platform_payment_config_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_platform_config.recharge_guard_version IS DISTINCT FROM
      p_expected_platform_guard_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED';
  END IF;

  SELECT tenant_config.*
  INTO v_tenant_config
  FROM public.tenant_payment_configs AS tenant_config
  WHERE tenant_config.id = p_payment_config_id
    AND tenant_config.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_tenant_config.updated_at IS DISTINCT FROM
      p_expected_tenant_config_updated_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED';
  END IF;

  IF v_platform_config.provider IS DISTINCT FROM 'wechat_pay'
    OR v_platform_config.profile_code IS DISTINCT FROM
      'tenant_service_provider'
    OR v_platform_config.principal_type IS DISTINCT FROM 'platform'
    OR v_platform_config.merchant_mode IS DISTINCT FROM
      'service_provider_sub_merchant'
    OR v_platform_config.status IS DISTINCT FROM 'active'
    OR v_platform_config.validation_status IS DISTINCT FROM 'valid'
    OR v_platform_config.last_validated_at IS NULL
    OR NOT ('project_payment' = ANY(v_platform_config.enabled_channels))
    OR NOT ('applyment' = ANY(v_platform_config.enabled_channels))
    OR nullif(btrim(v_platform_config.merchant_id), '') IS NULL
    OR nullif(btrim(v_platform_config.app_id), '') IS NULL
    OR nullif(btrim(v_platform_config.serial_no), '') IS NULL
    OR nullif(btrim(v_platform_config.encrypted_config_ref), '') IS NULL
    OR nullif(btrim(v_platform_config.secret_bundle_revision), '') IS NULL
    OR nullif(btrim(v_platform_config.notify_url), '') IS NULL
    OR v_platform_config.notify_url !~* '^https://'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PLATFORM_PROFILE_NOT_READY';
  END IF;

  IF jsonb_typeof(v_tenant_config.enabled_channels) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PLATFORM_PROFILE_MISMATCH';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_tenant_config.enabled_channels) AS channel(value)
      WHERE jsonb_typeof(channel.value) IS DISTINCT FROM 'string'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PLATFORM_PROFILE_MISMATCH';
  END IF;

  SELECT coalesce(
    array_agg(DISTINCT channel ORDER BY channel),
    ARRAY[]::text[]
  )
  INTO v_tenant_channels
  FROM jsonb_array_elements_text(v_tenant_config.enabled_channels)
    AS channel;

  SELECT coalesce(
    array_agg(DISTINCT channel ORDER BY channel),
    ARRAY[]::text[]
  )
  INTO v_platform_channels
  FROM unnest(v_platform_config.enabled_channels) AS channel;

  IF v_tenant_config.provider IS DISTINCT FROM 'wechat_pay'
    OR v_tenant_config.principal_type IS DISTINCT FROM 'tenant'
    OR v_tenant_config.merchant_mode IS DISTINCT FROM
      'service_provider_sub_merchant'
    OR v_tenant_config.status IS DISTINCT FROM 'active'
    OR v_tenant_config.validation_status IS DISTINCT FROM 'valid'
    OR v_tenant_config.applyment_state IS DISTINCT FROM 'opened'
    OR v_tenant_config.appid_binding_state IS DISTINCT FROM 'bound'
    OR nullif(btrim(v_tenant_config.sub_merchant_id), '') IS NULL
    OR v_tenant_config.platform_payment_config_id IS DISTINCT FROM
      v_platform_config.id
    OR v_tenant_config.merchant_id IS DISTINCT FROM
      v_platform_config.merchant_id
    OR v_tenant_config.app_id IS DISTINCT FROM v_platform_config.app_id
    OR v_tenant_config.sub_app_id IS NOT NULL
    OR v_tenant_config.encrypted_config_ref IS DISTINCT FROM
      v_platform_config.encrypted_config_ref
    OR v_tenant_config.serial_no IS DISTINCT FROM v_platform_config.serial_no
    OR v_tenant_config.notify_url IS DISTINCT FROM
      v_platform_config.notify_url
    OR v_tenant_config.validation_status IS DISTINCT FROM
      v_platform_config.validation_status
    OR v_tenant_config.last_validated_at IS DISTINCT FROM
      v_platform_config.last_validated_at
    OR v_tenant_channels IS DISTINCT FROM v_platform_channels
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'WECHAT_PAY_PLATFORM_PROFILE_MISMATCH';
  END IF;

  INSERT INTO public.wechat_payment_orders (
    tenant_id,
    payment_config_id,
    project_id,
    workflow_instance_id,
    workflow_task_id,
    receivable_plan_id,
    out_trade_no,
    amount,
    payer_openid,
    status,
    currency,
    created_by_employee_id,
    metadata
  ) VALUES (
    p_tenant_id,
    p_payment_config_id,
    p_project_id,
    p_workflow_instance_id,
    p_workflow_task_id,
    p_receivable_plan_id,
    p_out_trade_no,
    p_amount,
    p_payer_openid,
    'pending',
    'CNY',
    p_created_by_employee_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order(
  uuid, uuid, uuid, bigint, timestamptz, uuid, uuid, uuid, uuid, text, numeric,
  text, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order(
  uuid, uuid, uuid, bigint, timestamptz, uuid, uuid, uuid, uuid, text, numeric,
  text, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order(
  uuid, uuid, uuid, bigint, timestamptz, uuid, uuid, uuid, uuid, text, numeric,
  text, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wechat_pay_create_pending_service_provider_order(
  uuid, uuid, uuid, bigint, timestamptz, uuid, uuid, uuid, uuid, text, numeric,
  text, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_create_pending_wechat_recharge_order(
  p_tenant_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key text,
  p_package_code text,
  p_credits bigint,
  p_bonus_credits bigint,
  p_amount_fen integer,
  p_created_by uuid,
  p_payment_config_id uuid,
  p_expected_guard_version bigint,
  p_payment_expires_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.platform_payment_configs%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
BEGIN
  SELECT config.*
  INTO v_config
  FROM public.platform_payment_configs AS config
  WHERE config.id = p_payment_config_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_config.recharge_guard_version IS DISTINCT FROM
      p_expected_guard_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED';
  END IF;

  IF v_config.provider <> 'wechat_pay'
    OR v_config.profile_code <> 'platform_direct_recharge'
    OR v_config.merchant_mode <> 'direct_merchant'
    OR v_config.status <> 'active'
    OR v_config.validation_status <> 'valid'
    OR NOT ('tenant_recharge' = ANY(v_config.enabled_channels))
    OR v_config.merchant_id IS NULL
    OR v_config.app_id IS NULL
    OR v_config.encrypted_config_ref IS NULL
    OR nullif(btrim(v_config.secret_bundle_revision), '') IS NULL
    OR v_config.serial_no IS NULL
    OR v_config.notify_url IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BILLING_RECHARGE_PAYMENT_CONFIG_NOT_READY';
  END IF;

  INSERT INTO public.tenant_credit_orders (
    tenant_id,
    order_no,
    out_trade_no,
    idempotency_key,
    package_code,
    credits,
    bonus_credits,
    amount_fen,
    channel,
    status,
    created_by,
    payment_config_id,
    payment_expires_at,
    metadata
  ) VALUES (
    p_tenant_id,
    p_order_no,
    p_out_trade_no,
    p_idempotency_key,
    p_package_code,
    p_credits,
    p_bonus_credits,
    p_amount_fen,
    'wechat_pay',
    'pending',
    p_created_by,
    p_payment_config_id,
    p_payment_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.guard_pending_recharge_payment_config()
IS 'Serializes recharge creation with merchant identity, secret references, and secret bundle revision rotation.';
