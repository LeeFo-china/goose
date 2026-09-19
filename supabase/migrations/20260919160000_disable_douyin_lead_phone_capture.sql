-- Disable Douyin phone authorization for free-measurement lead capture.
-- Customer account login continues to use the separate customer-auth endpoint.
-- Rollback: restore the RPC body from 20260915090000, then explicitly choose
-- which installations may return to douyin_phone mode. Do not bulk-enable it.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.douyin_miniapp_installations IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.douyin_miniapp_installations AS installation
SET runtime_config = pg_catalog.jsonb_set(
      installation.runtime_config,
      '{features}',
      (
        CASE
          WHEN pg_catalog.jsonb_typeof(installation.runtime_config -> 'features') = 'object'
            THEN installation.runtime_config -> 'features'
          ELSE '{}'::jsonb
        END
      ) || pg_catalog.jsonb_build_object(
        'douyin_phone', false,
        'phone_capture_mode', 'sms'
      ),
      true
    ),
    updated_at = GREATEST(
      clock_timestamp(),
      installation.updated_at + interval '1 microsecond'
    )
WHERE installation.runtime_config #>> '{features,douyin_phone}' IS DISTINCT FROM 'false'
   OR installation.runtime_config #>> '{features,phone_capture_mode}' IS DISTINCT FROM 'sms';

CREATE OR REPLACE FUNCTION public.update_douyin_miniapp_lead_capture_config(
  p_tenant_id uuid,
  p_installation_id uuid,
  p_authorizer_appid text,
  p_expected_updated_at timestamptz,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_features jsonb;
  v_next_features jsonb;
  v_updated_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL
    OR p_installation_id IS NULL
    OR p_authorizer_appid IS NULL
    OR pg_catalog.btrim(p_authorizer_appid) = ''
    OR p_expected_updated_at IS NULL
    OR p_enabled IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_LEAD_CAPTURE_CONFIG_INVALID'
      )
    );
  END IF;

  IF p_enabled THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE'
      )
    );
  END IF;

  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.authorizer_appid = pg_catalog.btrim(p_authorizer_appid)
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_ACTIVE_INSTALLATION_NOT_FOUND'
      )
    );
  END IF;

  IF v_installation.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_CAPTURE_CONFIG_STALE'
      )
    );
  END IF;

  v_features := v_installation.runtime_config -> 'features';
  IF pg_catalog.jsonb_typeof(v_features) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(v_features -> 'cases') IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(v_features -> 'sites') IS DISTINCT FROM 'boolean'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_RUNTIME_CONFIG_INVALID'
      )
    );
  END IF;

  v_next_features := v_features || pg_catalog.jsonb_build_object(
    'douyin_phone', false,
    'phone_capture_mode', 'sms'
  );

  UPDATE public.douyin_miniapp_installations AS installation
  SET runtime_config = pg_catalog.jsonb_set(
        v_installation.runtime_config,
        '{features}',
        v_next_features,
        true
      ),
      updated_at = GREATEST(
        clock_timestamp(),
        v_installation.updated_at + interval '1 microsecond'
      )
  WHERE installation.id = v_installation.id
  RETURNING installation.updated_at INTO v_updated_at;

  RETURN pg_catalog.jsonb_build_object(
    'data', pg_catalog.jsonb_build_object(
      'installation_id', v_installation.id,
      'authorizer_appid', v_installation.authorizer_appid,
      'enabled', false,
      'updated_at', v_updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean
  )
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean
  )
FROM service_role;
GRANT EXECUTE ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean
  )
TO service_role;

COMMENT ON FUNCTION public.update_douyin_miniapp_lead_capture_config(
  uuid, uuid, text, timestamptz, boolean
) IS
  'Keeps free-measurement lead capture in SMS mode; Douyin phone authorization is reserved for customer login.';

COMMIT;
