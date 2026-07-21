-- Activate a tenant WeChat Pay configuration and close its applyment in one
-- transaction. This prevents a concurrent activation from leaving the config
-- active while the applyment remains open.

BEGIN;

CREATE OR REPLACE FUNCTION public.activate_wechat_pay_applyment_config(
  p_applyment_id uuid,
  p_expected_updated_at timestamptz,
  p_employee_id uuid,
  p_platform_payment_config_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applyment public.tenant_wechat_pay_applyments%ROWTYPE;
  v_platform_config public.platform_payment_configs%ROWTYPE;
  v_payment_config_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_ACTIVATION_FORBIDDEN';
  END IF;

  IF p_applyment_id IS NULL OR p_expected_updated_at IS NULL OR
     p_employee_id IS NULL OR p_platform_payment_config_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_ACTIVATION_INVALID';
  END IF;

  SELECT applyment.*
  INTO v_applyment
  FROM public.tenant_wechat_pay_applyments AS applyment
  WHERE applyment.id = p_applyment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_FOUND';
  END IF;

  IF v_applyment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_STATE_CHANGED';
  END IF;

  IF v_applyment.status NOT IN ('opened', 'bound') OR
     v_applyment.wechat_applyment_state_raw IS DISTINCT FROM
       'APPLYMENT_STATE_FINISHED' OR
     v_applyment.applyment_state IS DISTINCT FROM 'opened' OR
     v_applyment.sub_mchid IS NULL OR
     btrim(v_applyment.sub_mchid) = '' OR
     v_applyment.sub_appid IS NOT NULL OR
     v_applyment.appid_binding_state IS DISTINCT FROM 'bound' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_ACTIVATABLE';
  END IF;

  SELECT platform_config.*
  INTO v_platform_config
  FROM public.platform_payment_configs AS platform_config
  WHERE platform_config.id = p_platform_payment_config_id
  FOR SHARE;

  IF NOT FOUND OR
     v_platform_config.provider IS DISTINCT FROM 'wechat_pay' OR
     v_platform_config.profile_code IS DISTINCT FROM
       'tenant_service_provider' OR
     v_platform_config.principal_type IS DISTINCT FROM 'platform' OR
     v_platform_config.merchant_mode IS DISTINCT FROM
       'service_provider_sub_merchant' OR
     v_platform_config.status IS DISTINCT FROM 'active' OR
     v_platform_config.validation_status IS DISTINCT FROM 'valid' OR
     v_platform_config.merchant_id IS NULL OR
     btrim(v_platform_config.merchant_id) = '' OR
     v_platform_config.app_id IS NULL OR
     btrim(v_platform_config.app_id) = '' OR
     v_platform_config.encrypted_config_ref IS NULL OR
     btrim(v_platform_config.encrypted_config_ref) = '' OR
     v_platform_config.secret_bundle_revision IS NULL OR
     btrim(v_platform_config.secret_bundle_revision) = '' OR
     v_platform_config.serial_no IS NULL OR
     btrim(v_platform_config.serial_no) = '' OR
     v_platform_config.notify_url IS NULL OR
     btrim(v_platform_config.notify_url) = '' OR
     NOT v_platform_config.enabled_channels @>
       ARRAY['project_payment', 'applyment']::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_PAYMENT_PROFILE_NOT_READY';
  END IF;

  INSERT INTO public.tenant_payment_configs (
    tenant_id,
    provider,
    principal_type,
    merchant_mode,
    merchant_name,
    merchant_id,
    sub_merchant_id,
    app_id,
    sub_app_id,
    applyment_business_code,
    applyment_id,
    applyment_state,
    applyment_state_message,
    appid_binding_state,
    appid_binding_message,
    opened_at,
    status,
    enabled_channels,
    settlement_account_summary,
    encrypted_config_ref,
    risk_switches,
    serial_no,
    notify_url,
    validation_status,
    last_validated_at,
    platform_payment_config_id,
    enabled_at,
    disabled_at,
    suspended_at,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    v_applyment.tenant_id,
    'wechat_pay',
    'tenant',
    'service_provider_sub_merchant',
    v_applyment.merchant_short_name,
    v_platform_config.merchant_id,
    v_applyment.sub_mchid,
    v_platform_config.app_id,
    NULL,
    v_applyment.applyment_business_code,
    v_applyment.applyment_id,
    'opened',
    v_applyment.applyment_state_message,
    'bound',
    v_applyment.appid_binding_message,
    COALESCE(v_applyment.opened_at, v_now),
    'active',
    to_jsonb(v_platform_config.enabled_channels),
    v_applyment.settlement_account_summary,
    v_platform_config.encrypted_config_ref,
    '{}'::jsonb,
    v_platform_config.serial_no,
    v_platform_config.notify_url,
    'valid',
    v_platform_config.last_validated_at,
    v_platform_config.id,
    v_now,
    NULL,
    NULL,
    p_employee_id,
    p_employee_id
  )
  ON CONFLICT (tenant_id, provider) DO UPDATE
  SET
    principal_type = EXCLUDED.principal_type,
    merchant_mode = EXCLUDED.merchant_mode,
    merchant_name = EXCLUDED.merchant_name,
    merchant_id = EXCLUDED.merchant_id,
    sub_merchant_id = EXCLUDED.sub_merchant_id,
    app_id = EXCLUDED.app_id,
    sub_app_id = EXCLUDED.sub_app_id,
    applyment_business_code = EXCLUDED.applyment_business_code,
    applyment_id = EXCLUDED.applyment_id,
    applyment_state = EXCLUDED.applyment_state,
    applyment_state_message = EXCLUDED.applyment_state_message,
    appid_binding_state = EXCLUDED.appid_binding_state,
    appid_binding_message = EXCLUDED.appid_binding_message,
    opened_at = EXCLUDED.opened_at,
    status = 'active',
    enabled_channels = EXCLUDED.enabled_channels,
    settlement_account_summary = EXCLUDED.settlement_account_summary,
    encrypted_config_ref = EXCLUDED.encrypted_config_ref,
    risk_switches = EXCLUDED.risk_switches,
    serial_no = EXCLUDED.serial_no,
    notify_url = EXCLUDED.notify_url,
    validation_status = EXCLUDED.validation_status,
    last_validated_at = EXCLUDED.last_validated_at,
    platform_payment_config_id = EXCLUDED.platform_payment_config_id,
    enabled_at = v_now,
    disabled_at = NULL,
    suspended_at = NULL,
    updated_by_employee_id = p_employee_id,
    updated_at = v_now
  RETURNING id INTO v_payment_config_id;

  UPDATE public.tenant_wechat_pay_applyments
  SET
    status = 'active',
    payment_config_id = v_payment_config_id,
    activated_at = v_now,
    sensitive_payload_ciphertext = NULL,
    sensitive_payload_version = NULL,
    sensitive_payload_updated_at = NULL,
    has_sensitive_payload = false,
    updated_by_employee_id = p_employee_id
  WHERE id = v_applyment.id;

  INSERT INTO public.tenant_wechat_pay_applyment_events (
    tenant_id,
    applyment_id,
    event_type,
    from_status,
    to_status,
    message,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_applyment.tenant_id,
    v_applyment.id,
    'config_activated',
    v_applyment.status,
    'active',
    '平台激活租户微信支付配置',
    p_employee_id,
    jsonb_build_object('payment_config_id', v_payment_config_id)
  );

  RETURN v_payment_config_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_wechat_pay_applyment_config(
  uuid, timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_wechat_pay_applyment_config(
  uuid, timestamptz, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.activate_wechat_pay_applyment_config(
  uuid, timestamptz, uuid, uuid
) IS '原子激活租户微信支付配置、关闭进件申请、清除敏感资料并记录审计事件。';

COMMIT;
