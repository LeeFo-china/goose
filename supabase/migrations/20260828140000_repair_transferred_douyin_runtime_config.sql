-- Restore public Douyin workspace configuration discarded by the tenant
-- transfer sanitizer. Authorization credentials remain revoked and cleared.
-- Rollback: use a forward migration with another valid runtime configuration;
-- do not restore the invalid empty object that caused the workspace outage.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_installation_id constant uuid :=
    '82061c96-29ac-4426-baff-5efc1061fbc8'::uuid;
  v_tenant_id constant uuid :=
    '3eebca47-961f-4899-b976-a3d3208d326b'::uuid;
  v_sanitized_authorizer_appid constant text :=
    'migrated-disabled-82061c96-29ac-4426-baff-5efc1061fbc8';
  v_expected_runtime_config constant jsonb := $config$
    {
      "brand": {
        "logo_url": "https://assets.gooes.cn/douyin/gushi-qingtian/logo.png",
        "qualifications": []
      },
      "theme": {
        "primary_color": "#C45A32",
        "navigation_text_color": "black"
      },
      "features": {
        "cases": true,
        "sites": true,
        "sms_lead": true,
        "douyin_phone": false,
        "phone_capture_mode": "sms"
      },
      "home_banners": [],
      "trust_metrics": [],
      "privacy_policy_version": "2026-07-19"
    }
  $config$::jsonb;
  v_updated_count integer;
BEGIN
  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = v_installation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_installation.authorizer_appid IS DISTINCT FROM v_sanitized_authorizer_appid THEN
    RETURN;
  END IF;

  IF v_installation.runtime_config = v_expected_runtime_config THEN
    RETURN;
  END IF;

  IF v_installation.tenant_id IS DISTINCT FROM v_tenant_id
    OR v_installation.installation_kind IS DISTINCT FROM 'merchant'
    OR v_installation.authorization_status IS DISTINCT FROM 'revoked'
    OR v_installation.runtime_config IS DISTINCT FROM '{}'::jsonb
    OR v_installation.deployment_key IS NOT NULL
    OR v_installation.access_token_ciphertext IS NOT NULL
    OR v_installation.access_token_iv IS NOT NULL
    OR v_installation.access_token_tag IS NOT NULL
    OR v_installation.access_token_key_version IS NOT NULL
    OR v_installation.access_token_expires_at IS NOT NULL
    OR v_installation.refresh_token_ciphertext IS NOT NULL
    OR v_installation.refresh_token_iv IS NOT NULL
    OR v_installation.refresh_token_tag IS NOT NULL
    OR v_installation.refresh_token_key_version IS NOT NULL
    OR v_installation.refresh_token_expires_at IS NOT NULL
    OR v_installation.permission_snapshot IS DISTINCT FROM '[]'::jsonb
    OR v_installation.token_refresh_claim_token IS NOT NULL
    OR v_installation.token_refresh_claim_expires_at IS NOT NULL
    OR v_installation.token_refresh_last_error IS NOT NULL
    OR v_installation.template_id IS NOT NULL
    OR v_installation.template_version IS NOT NULL
    OR v_installation.template_release_id IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_TRANSFER_RUNTIME_CONFIG_PRECONDITION_FAILED';
  END IF;

  UPDATE public.douyin_miniapp_installations
  SET runtime_config = v_expected_runtime_config,
      updated_at = clock_timestamp()
  WHERE id = v_installation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TRANSFER_RUNTIME_CONFIG_UPDATE_MISMATCH';
  END IF;
END;
$$;

COMMIT;
