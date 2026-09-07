-- Store the Douyin clue component identity per authorized miniapp while the
-- runtime feature union remains the active phone-capture contract.
--
-- Rollback (forward migration only): first force every merchant installation
-- back to SMS mode, stop tenant configuration traffic, revoke the command,
-- then drop the RPC, dedicated trigger/function, constraints and column. Do
-- not drop retained component IDs before exporting them for reconfiguration.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.douyin_miniapp_installations IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.douyin_miniapp_installations
ADD COLUMN clue_component_id text;

UPDATE public.douyin_miniapp_installations AS installation
SET clue_component_id =
  pg_catalog.btrim(installation.runtime_config -> 'features' ->> 'clue_component_id')
WHERE installation.runtime_config -> 'features' ->> 'phone_capture_mode' = 'douyin_phone'
  AND installation.installation_kind = 'merchant'
  AND pg_catalog.btrim(
    installation.runtime_config -> 'features' ->> 'clue_component_id'
  ) ~ '^[A-Za-z0-9_-]{1,128}$';

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_installations AS installation
    WHERE installation.installation_kind = 'merchant'
      AND installation.runtime_config -> 'features' ->> 'phone_capture_mode' = 'douyin_phone'
      AND (
        installation.clue_component_id IS NULL
        OR installation.runtime_config -> 'features' ->> 'clue_component_id'
          IS DISTINCT FROM installation.clue_component_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_CLUE_COMPONENT_BACKFILL_INVALID';
  END IF;
END;
$block$;

ALTER TABLE public.douyin_miniapp_installations
ADD CONSTRAINT douyin_installations_clue_component_id_check
CHECK (
  clue_component_id IS NULL
  OR clue_component_id ~ '^[A-Za-z0-9_-]{1,128}$'
),
ADD CONSTRAINT douyin_installations_active_clue_component_check
CHECK (
  installation_kind <> 'merchant'
  OR runtime_config -> 'features' ->> 'phone_capture_mode' IS DISTINCT FROM 'douyin_phone'
  OR (
    clue_component_id IS NOT NULL
    AND runtime_config -> 'features' ->> 'clue_component_id'
      = clue_component_id
  )
);

CREATE OR REPLACE FUNCTION public.update_douyin_miniapp_installation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.updated_at := GREATEST(
    clock_timestamp(),
    OLD.updated_at + interval '1 microsecond',
    NEW.updated_at
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.update_douyin_miniapp_installation_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER tr_douyin_miniapp_installations_updated_at
ON public.douyin_miniapp_installations;

CREATE TRIGGER tr_douyin_miniapp_installations_updated_at
BEFORE UPDATE ON public.douyin_miniapp_installations
FOR EACH ROW
EXECUTE FUNCTION public.update_douyin_miniapp_installation_updated_at();

CREATE OR REPLACE FUNCTION public.update_douyin_miniapp_lead_capture_config(
  p_tenant_id uuid,
  p_installation_id uuid,
  p_authorizer_appid text,
  p_expected_updated_at timestamptz,
  p_enabled boolean,
  p_clue_component_id text
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
  v_stored_clue_component_id text;
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

  IF p_clue_component_id IS NOT NULL
    AND pg_catalog.btrim(p_clue_component_id) !~ '^[A-Za-z0-9_-]{1,128}$'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_CLUE_COMPONENT_ID_INVALID'
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

  v_stored_clue_component_id := COALESCE(
    NULLIF(pg_catalog.btrim(p_clue_component_id), ''),
    v_installation.clue_component_id
  );

  IF p_enabled AND v_stored_clue_component_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_CLUE_COMPONENT_ID_REQUIRED'
      )
    );
  END IF;

  IF p_enabled THEN
    v_next_features := pg_catalog.jsonb_build_object(
      'cases', v_features -> 'cases',
      'sites', v_features -> 'sites',
      'sms_lead', true,
      'douyin_phone', true,
      'phone_capture_mode', 'douyin_phone',
      'clue_component_id', v_stored_clue_component_id
    );
  ELSE
    v_next_features := pg_catalog.jsonb_build_object(
      'cases', v_features -> 'cases',
      'sites', v_features -> 'sites',
      'sms_lead', true,
      'douyin_phone', false,
      'phone_capture_mode', 'sms'
    );
  END IF;

  UPDATE public.douyin_miniapp_installations AS installation
  SET clue_component_id = v_stored_clue_component_id,
      runtime_config = pg_catalog.jsonb_set(
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
      'enabled', p_enabled,
      'clue_component_id', v_stored_clue_component_id,
      'updated_at', v_updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean, text
  )
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean, text
  )
FROM service_role;
GRANT EXECUTE ON FUNCTION
  public.update_douyin_miniapp_lead_capture_config(
    uuid, uuid, text, timestamptz, boolean, text
  )
TO service_role;

COMMENT ON COLUMN public.douyin_miniapp_installations.clue_component_id IS
  'Douyin clue component ID bound to this exact authorizer AppID; retained while SMS mode is active.';
COMMENT ON FUNCTION public.update_douyin_miniapp_lead_capture_config(
  uuid, uuid, text, timestamptz, boolean, text
) IS
  'Atomically updates tenant-owned phone capture mode for one active merchant installation.';

COMMIT;
