-- Restore the tenant's public Douyin runtime configuration after production
-- reauthorization created a new installation from defaults. Credentials and
-- authorization state are intentionally untouched.
--
-- Rollback: use a forward migration that restores the target runtime_config
-- captured before this migration. Do not roll back after tenant-side edits.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $repair$
DECLARE
  v_tenant_id constant uuid := '3eebca47-961f-4899-b976-a3d3208d326b';
  v_target_id constant uuid := '2452739c-1683-4a57-a0af-b5e973e349a0';
  v_source_id constant uuid := '82061c96-29ac-4426-baff-5efc1061fbc8';
  v_target public.douyin_miniapp_installations%ROWTYPE;
  v_source public.douyin_miniapp_installations%ROWTYPE;
  v_merged_runtime jsonb;
  v_updated_count integer;
BEGIN
  SELECT installation.*
  INTO v_target
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = v_target_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN RETURN; END IF;

  SELECT installation.*
  INTO v_source
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = v_source_id
  FOR UPDATE;

  IF v_target.id IS NOT NULL AND v_source.id IS NOT NULL THEN
    v_merged_runtime := v_target.runtime_config || v_source.runtime_config;
    IF v_target.runtime_config = v_merged_runtime THEN RETURN; END IF;
  END IF;

  IF v_source.id IS NULL
    OR v_target.tenant_id IS DISTINCT FROM v_tenant_id
    OR v_source.tenant_id IS DISTINCT FROM v_tenant_id
    OR v_target.component_appid IS DISTINCT FROM v_source.component_appid
    OR v_target.authorizer_appid IS DISTINCT FROM 'ttd033a68e4e56ccd301'
    OR v_source.authorizer_appid IS DISTINCT FROM
      'migrated-disabled-82061c96-29ac-4426-baff-5efc1061fbc8'
    OR v_target.installation_kind IS DISTINCT FROM 'merchant'
    OR v_source.installation_kind IS DISTINCT FROM 'merchant'
    OR v_target.authorization_status IS DISTINCT FROM 'active'
    OR v_source.authorization_status IS DISTINCT FROM 'revoked'
    OR jsonb_typeof(v_target.runtime_config) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_source.runtime_config) IS DISTINCT FROM 'object'
    OR nullif(v_target.runtime_config #>> '{brand,logo_url}', '') IS NOT NULL
    OR nullif(v_source.runtime_config #>> '{brand,logo_url}', '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_REAUTHORIZED_RUNTIME_CONFIG_PRECONDITION_FAILED';
  END IF;

  UPDATE public.douyin_miniapp_installations
  SET runtime_config = v_merged_runtime,
      updated_at = clock_timestamp()
  WHERE id = v_target_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_REAUTHORIZED_RUNTIME_CONFIG_UPDATE_MISMATCH';
  END IF;
END
$repair$;

COMMIT;
