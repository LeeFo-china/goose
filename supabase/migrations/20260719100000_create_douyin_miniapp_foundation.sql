-- Create the Douyin third-party component and miniapp installation foundation.
--
-- Destructive rollback order:
-- 1. disable callbacks and session issuance first;
-- 2. drop refresh RPCs before tables, then drop the installation table and the
--    component table;
-- 3. remove role_permissions before the permission row.
-- Credential token loss requires merchant re-authorization. Never roll this
-- migration back while callbacks or session issuance remain enabled.

BEGIN;

CREATE TABLE public.douyin_third_party_components (
  component_appid text PRIMARY KEY,
  component_ticket_ciphertext text NULL,
  component_ticket_iv text NULL,
  component_ticket_tag text NULL,
  component_ticket_key_version text NULL,
  component_ticket_received_at timestamptz NULL,
  access_token_ciphertext text NULL,
  access_token_iv text NULL,
  access_token_tag text NULL,
  access_token_key_version text NULL,
  access_token_expires_at timestamptz NULL,
  token_refresh_claim_token uuid NULL,
  token_refresh_claim_expires_at timestamptz NULL,
  token_refresh_last_error text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_components_appid_not_blank_check
    CHECK (btrim(component_appid) <> ''),
  CONSTRAINT douyin_components_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT douyin_components_ticket_envelope_check CHECK (
    (
      component_ticket_ciphertext IS NULL
      AND component_ticket_iv IS NULL
      AND component_ticket_tag IS NULL
      AND component_ticket_key_version IS NULL
      AND component_ticket_received_at IS NULL
    ) OR (
      component_ticket_ciphertext IS NOT NULL
      AND btrim(component_ticket_ciphertext) <> ''
      AND component_ticket_iv IS NOT NULL
      AND btrim(component_ticket_iv) <> ''
      AND component_ticket_tag IS NOT NULL
      AND btrim(component_ticket_tag) <> ''
      AND component_ticket_key_version IS NOT NULL
      AND btrim(component_ticket_key_version) <> ''
      AND component_ticket_received_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_components_access_token_envelope_check CHECK (
    (
      access_token_ciphertext IS NULL
      AND access_token_iv IS NULL
      AND access_token_tag IS NULL
      AND access_token_key_version IS NULL
      AND access_token_expires_at IS NULL
    ) OR (
      access_token_ciphertext IS NOT NULL
      AND btrim(access_token_ciphertext) <> ''
      AND access_token_iv IS NOT NULL
      AND btrim(access_token_iv) <> ''
      AND access_token_tag IS NOT NULL
      AND btrim(access_token_tag) <> ''
      AND access_token_key_version IS NOT NULL
      AND btrim(access_token_key_version) <> ''
      AND access_token_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_components_refresh_lease_check CHECK (
    (
      token_refresh_claim_token IS NULL
      AND token_refresh_claim_expires_at IS NULL
    ) OR (
      token_refresh_claim_token IS NOT NULL
      AND token_refresh_claim_expires_at IS NOT NULL
      AND status = 'active'
      AND component_ticket_ciphertext IS NOT NULL
      AND component_ticket_iv IS NOT NULL
      AND component_ticket_tag IS NOT NULL
      AND component_ticket_key_version IS NOT NULL
      AND component_ticket_received_at IS NOT NULL
      AND token_refresh_last_error IS NULL
    )
  ),
  CONSTRAINT douyin_components_refresh_error_code_check
    CHECK (
      token_refresh_last_error IS NULL
      OR token_refresh_last_error ~ '^DOUYIN_[A-Z0-9_]{1,95}$'
    )
);

CREATE TABLE public.douyin_miniapp_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  component_appid text NOT NULL
    REFERENCES public.douyin_third_party_components(component_appid)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  authorizer_appid text NOT NULL,
  deployment_key text NULL,
  installation_kind text NOT NULL DEFAULT 'merchant',
  authorization_status text NOT NULL DEFAULT 'authorized_unbound',
  access_token_ciphertext text NULL,
  access_token_iv text NULL,
  access_token_tag text NULL,
  access_token_key_version text NULL,
  access_token_expires_at timestamptz NULL,
  refresh_token_ciphertext text NULL,
  refresh_token_iv text NULL,
  refresh_token_tag text NULL,
  refresh_token_key_version text NULL,
  refresh_token_expires_at timestamptz NULL,
  permission_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_refresh_claim_token uuid NULL,
  token_refresh_claim_expires_at timestamptz NULL,
  token_refresh_last_error text NULL,
  runtime_config jsonb NOT NULL DEFAULT '{
    "brand": {
      "logo_url": null,
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
  }'::jsonb,
  template_id text NULL,
  template_version text NULL,
  last_submitted_at timestamptz NULL,
  last_audited_at timestamptz NULL,
  last_released_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authorizer_appid),
  CONSTRAINT douyin_installations_authorizer_appid_not_blank_check
    CHECK (btrim(authorizer_appid) <> ''),
  CONSTRAINT douyin_installations_deployment_key_not_blank_check
    CHECK (deployment_key IS NULL OR btrim(deployment_key) <> ''),
  CONSTRAINT douyin_installations_kind_check
    CHECK (installation_kind IN ('merchant', 'template_development')),
  CONSTRAINT douyin_installations_authorization_status_check
    CHECK (
      authorization_status IN ('authorized_unbound', 'active', 'disabled', 'revoked')
    ),
  CONSTRAINT douyin_installations_access_token_envelope_check CHECK (
    (
      access_token_ciphertext IS NULL
      AND access_token_iv IS NULL
      AND access_token_tag IS NULL
      AND access_token_key_version IS NULL
      AND access_token_expires_at IS NULL
    ) OR (
      access_token_ciphertext IS NOT NULL
      AND btrim(access_token_ciphertext) <> ''
      AND access_token_iv IS NOT NULL
      AND btrim(access_token_iv) <> ''
      AND access_token_tag IS NOT NULL
      AND btrim(access_token_tag) <> ''
      AND access_token_key_version IS NOT NULL
      AND btrim(access_token_key_version) <> ''
      AND access_token_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_installations_refresh_token_envelope_check CHECK (
    (
      refresh_token_ciphertext IS NULL
      AND refresh_token_iv IS NULL
      AND refresh_token_tag IS NULL
      AND refresh_token_key_version IS NULL
      AND refresh_token_expires_at IS NULL
    ) OR (
      refresh_token_ciphertext IS NOT NULL
      AND btrim(refresh_token_ciphertext) <> ''
      AND refresh_token_iv IS NOT NULL
      AND btrim(refresh_token_iv) <> ''
      AND refresh_token_tag IS NOT NULL
      AND btrim(refresh_token_tag) <> ''
      AND refresh_token_key_version IS NOT NULL
      AND btrim(refresh_token_key_version) <> ''
      AND refresh_token_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_installations_permission_snapshot_array_check
    CHECK (jsonb_typeof(permission_snapshot) = 'array'),
  CONSTRAINT douyin_installations_refresh_lease_check CHECK (
    (
      token_refresh_claim_token IS NULL
      AND token_refresh_claim_expires_at IS NULL
    ) OR (
      token_refresh_claim_token IS NOT NULL
      AND token_refresh_claim_expires_at IS NOT NULL
      AND installation_kind = 'merchant'
      AND authorization_status IN ('authorized_unbound', 'active')
      AND refresh_token_ciphertext IS NOT NULL
      AND refresh_token_iv IS NOT NULL
      AND refresh_token_tag IS NOT NULL
      AND refresh_token_key_version IS NOT NULL
      AND refresh_token_expires_at IS NOT NULL
      AND token_refresh_last_error IS NULL
    )
  ),
  CONSTRAINT douyin_installations_refresh_error_code_check
    CHECK (
      token_refresh_last_error IS NULL
      OR token_refresh_last_error ~ '^DOUYIN_[A-Z0-9_]{1,95}$'
    ),
  CONSTRAINT douyin_installations_runtime_config_object_check
    CHECK (jsonb_typeof(runtime_config) = 'object'),
  CONSTRAINT douyin_installations_template_id_check
    CHECK (template_id IS NULL OR template_id ~ '^[1-9][0-9]{0,18}$'),
  CONSTRAINT douyin_installations_template_version_not_blank_check
    CHECK (template_version IS NULL OR btrim(template_version) <> ''),
  CONSTRAINT douyin_installations_revocation_state_check CHECK (
    (authorization_status = 'revoked' AND revoked_at IS NOT NULL)
    OR (authorization_status <> 'revoked' AND revoked_at IS NULL)
  ),
  CONSTRAINT douyin_installations_active_merchant_check CHECK (
    installation_kind <> 'merchant'
    OR authorization_status <> 'active'
    OR (
      tenant_id IS NOT NULL
      AND deployment_key IS NOT NULL
      AND refresh_token_ciphertext IS NOT NULL
      AND refresh_token_iv IS NOT NULL
      AND refresh_token_tag IS NOT NULL
      AND refresh_token_key_version IS NOT NULL
      AND refresh_token_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_installations_template_development_check CHECK (
    installation_kind <> 'template_development'
    OR (
      deployment_key IS NULL
      AND access_token_ciphertext IS NULL
      AND access_token_iv IS NULL
      AND access_token_tag IS NULL
      AND access_token_key_version IS NULL
      AND access_token_expires_at IS NULL
      AND refresh_token_ciphertext IS NULL
      AND refresh_token_iv IS NULL
      AND refresh_token_tag IS NULL
      AND refresh_token_key_version IS NULL
      AND refresh_token_expires_at IS NULL
      AND token_refresh_claim_token IS NULL
      AND token_refresh_claim_expires_at IS NULL
      AND token_refresh_last_error IS NULL
    )
  )
);

-- Contract note: UNIQUE (deployment_key) is implemented once by the required
-- partial unique index. A table-level nullable unique constraint would create a
-- second equivalent index without strengthening the invariant.
CREATE UNIQUE INDEX douyin_miniapp_installations_deployment_key_key
ON public.douyin_miniapp_installations(deployment_key)
WHERE deployment_key IS NOT NULL;

CREATE INDEX douyin_miniapp_installations_tenant_status_idx
ON public.douyin_miniapp_installations(tenant_id, authorization_status);

CREATE INDEX douyin_miniapp_installations_status_updated_idx
ON public.douyin_miniapp_installations(authorization_status, updated_at DESC);

CREATE TRIGGER tr_douyin_third_party_components_updated_at
  BEFORE UPDATE ON public.douyin_third_party_components
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_douyin_miniapp_installations_updated_at
  BEFORE UPDATE ON public.douyin_miniapp_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_third_party_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_miniapp_installations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_third_party_components FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.douyin_miniapp_installations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.douyin_third_party_components FROM service_role;
REVOKE ALL ON TABLE public.douyin_miniapp_installations FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_third_party_components TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_installations TO service_role;

CREATE OR REPLACE FUNCTION public.claim_douyin_component_token_refresh(
  p_component_appid text
)
RETURNS TABLE(claim_token uuid, claim_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_claim_token uuid := gen_random_uuid();
BEGIN
  IF p_component_appid IS NULL OR btrim(p_component_appid) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_COMPONENT_TOKEN_REFRESH_CLAIM_INVALID';
  END IF;

  RETURN QUERY
  UPDATE public.douyin_third_party_components AS component
  SET
    token_refresh_claim_token = v_claim_token,
    token_refresh_claim_expires_at = v_now + interval '30 seconds',
    token_refresh_last_error = NULL
  WHERE component.component_appid = p_component_appid
    AND component.status = 'active'
    AND component.component_ticket_received_at IS NOT NULL
    AND (
      component.access_token_expires_at IS NULL
      OR component.access_token_expires_at <= v_now + interval '5 minutes'
    )
    AND (
      component.token_refresh_claim_token IS NULL
      OR component.token_refresh_claim_expires_at <= v_now
    )
  RETURNING
    component.token_refresh_claim_token,
    component.token_refresh_claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_douyin_component_token_refresh(
  p_component_appid text,
  p_claim_token uuid,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_tag text,
  p_access_token_key_version text,
  p_access_token_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_updated integer;
BEGIN
  IF p_component_appid IS NULL
    OR btrim(p_component_appid) = ''
    OR p_claim_token IS NULL
    OR p_access_token_ciphertext IS NULL
    OR btrim(p_access_token_ciphertext) = ''
    OR p_access_token_iv IS NULL
    OR btrim(p_access_token_iv) = ''
    OR p_access_token_tag IS NULL
    OR btrim(p_access_token_tag) = ''
    OR p_access_token_key_version IS NULL
    OR btrim(p_access_token_key_version) = ''
    OR p_access_token_expires_at IS NULL
    OR p_access_token_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_COMPONENT_TOKEN_REFRESH_COMPLETION_INVALID';
  END IF;

  UPDATE public.douyin_third_party_components AS component
  SET
    access_token_ciphertext = p_access_token_ciphertext,
    access_token_iv = p_access_token_iv,
    access_token_tag = p_access_token_tag,
    access_token_key_version = p_access_token_key_version,
    access_token_expires_at = p_access_token_expires_at,
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = NULL
  WHERE component.component_appid = p_component_appid
    AND component.status = 'active'
    AND component.token_refresh_claim_token = p_claim_token
    AND component.token_refresh_claim_expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_douyin_component_token_refresh(
  p_component_appid text,
  p_claim_token uuid,
  p_last_refresh_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_updated integer;
BEGIN
  IF p_component_appid IS NULL
    OR btrim(p_component_appid) = ''
    OR p_claim_token IS NULL
    OR p_last_refresh_error_code IS NULL
    OR p_last_refresh_error_code !~ '^DOUYIN_[A-Z0-9_]{1,95}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_COMPONENT_TOKEN_REFRESH_FAILURE_INVALID';
  END IF;

  UPDATE public.douyin_third_party_components AS component
  SET
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = p_last_refresh_error_code
  WHERE component.component_appid = p_component_appid
    AND component.token_refresh_claim_token = p_claim_token
    AND component.token_refresh_claim_expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_douyin_authorizer_token_refresh(
  p_installation_id uuid
)
RETURNS TABLE(claim_token uuid, claim_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_claim_token uuid := gen_random_uuid();
BEGIN
  IF p_installation_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZER_TOKEN_REFRESH_CLAIM_INVALID';
  END IF;

  RETURN QUERY
  UPDATE public.douyin_miniapp_installations AS installation
  SET
    token_refresh_claim_token = v_claim_token,
    token_refresh_claim_expires_at = v_now + interval '30 seconds',
    token_refresh_last_error = NULL
  WHERE installation.id = p_installation_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status IN ('authorized_unbound', 'active')
    AND installation.refresh_token_expires_at IS NOT NULL
    AND (
      installation.access_token_expires_at IS NULL
      OR installation.access_token_expires_at <= v_now + interval '5 minutes'
    )
    AND (
      installation.token_refresh_claim_token IS NULL
      OR installation.token_refresh_claim_expires_at <= v_now
    )
  RETURNING
    installation.token_refresh_claim_token,
    installation.token_refresh_claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_douyin_authorizer_token_refresh(
  p_installation_id uuid,
  p_claim_token uuid,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_tag text,
  p_access_token_key_version text,
  p_access_token_expires_at timestamptz,
  p_refresh_token_ciphertext text,
  p_refresh_token_iv text,
  p_refresh_token_tag text,
  p_refresh_token_key_version text,
  p_refresh_token_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_refresh_rotated boolean;
  v_updated integer;
BEGIN
  IF p_installation_id IS NULL
    OR p_claim_token IS NULL
    OR p_access_token_ciphertext IS NULL
    OR btrim(p_access_token_ciphertext) = ''
    OR p_access_token_iv IS NULL
    OR btrim(p_access_token_iv) = ''
    OR p_access_token_tag IS NULL
    OR btrim(p_access_token_tag) = ''
    OR p_access_token_key_version IS NULL
    OR btrim(p_access_token_key_version) = ''
    OR p_access_token_expires_at IS NULL
    OR p_access_token_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZER_TOKEN_REFRESH_COMPLETION_INVALID';
  END IF;

  v_refresh_rotated := p_refresh_token_ciphertext IS NOT NULL
    OR p_refresh_token_iv IS NOT NULL
    OR p_refresh_token_tag IS NOT NULL
    OR p_refresh_token_key_version IS NOT NULL
    OR p_refresh_token_expires_at IS NOT NULL;

  IF v_refresh_rotated AND (
    p_refresh_token_ciphertext IS NULL
    OR btrim(p_refresh_token_ciphertext) = ''
    OR p_refresh_token_iv IS NULL
    OR btrim(p_refresh_token_iv) = ''
    OR p_refresh_token_tag IS NULL
    OR btrim(p_refresh_token_tag) = ''
    OR p_refresh_token_key_version IS NULL
    OR btrim(p_refresh_token_key_version) = ''
    OR p_refresh_token_expires_at IS NULL
    OR p_refresh_token_expires_at <= v_now
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZER_REFRESH_TOKEN_ROTATION_INVALID';
  END IF;

  UPDATE public.douyin_miniapp_installations AS installation
  SET
    access_token_ciphertext = p_access_token_ciphertext,
    access_token_iv = p_access_token_iv,
    access_token_tag = p_access_token_tag,
    access_token_key_version = p_access_token_key_version,
    access_token_expires_at = p_access_token_expires_at,
    refresh_token_ciphertext = CASE
      WHEN v_refresh_rotated THEN p_refresh_token_ciphertext
      ELSE installation.refresh_token_ciphertext
    END,
    refresh_token_iv = CASE
      WHEN v_refresh_rotated THEN p_refresh_token_iv
      ELSE installation.refresh_token_iv
    END,
    refresh_token_tag = CASE
      WHEN v_refresh_rotated THEN p_refresh_token_tag
      ELSE installation.refresh_token_tag
    END,
    refresh_token_key_version = CASE
      WHEN v_refresh_rotated THEN p_refresh_token_key_version
      ELSE installation.refresh_token_key_version
    END,
    refresh_token_expires_at = CASE
      WHEN v_refresh_rotated THEN p_refresh_token_expires_at
      ELSE installation.refresh_token_expires_at
    END,
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = NULL
  WHERE installation.id = p_installation_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status IN ('authorized_unbound', 'active')
    AND installation.token_refresh_claim_token = p_claim_token
    AND installation.token_refresh_claim_expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_douyin_authorizer_token_refresh(
  p_installation_id uuid,
  p_claim_token uuid,
  p_last_refresh_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_updated integer;
BEGIN
  IF p_installation_id IS NULL
    OR p_claim_token IS NULL
    OR p_last_refresh_error_code IS NULL
    OR p_last_refresh_error_code !~ '^DOUYIN_[A-Z0-9_]{1,95}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZER_TOKEN_REFRESH_FAILURE_INVALID';
  END IF;

  UPDATE public.douyin_miniapp_installations AS installation
  SET
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = p_last_refresh_error_code
  WHERE installation.id = p_installation_id
    AND installation.token_refresh_claim_token = p_claim_token
    AND installation.token_refresh_claim_expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_douyin_component_token_refresh(text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_douyin_component_token_refresh(
  text, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_douyin_component_token_refresh(
  text, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_douyin_authorizer_token_refresh(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_douyin_authorizer_token_refresh(
  uuid, uuid, text, text, text, text, timestamptz,
  text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_douyin_authorizer_token_refresh(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_douyin_component_token_refresh(text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_component_token_refresh(
  text, uuid, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_douyin_component_token_refresh(
  text, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_douyin_authorizer_token_refresh(uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_authorizer_token_refresh(
  uuid, uuid, text, text, text, text, timestamptz,
  text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_douyin_authorizer_token_refresh(
  uuid, uuid, text
) TO service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES (
  'platform.douyin_miniapp.manage',
  '管理抖音小程序',
  'platform',
  'douyin_miniapp',
  'manage',
  '管理抖音装修营销小程序授权、配置与发布',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code = 'platform.douyin_miniapp.manage'
WHERE roles.code IN ('platform_admin', 'system_admin')
  AND roles.tenant_id IS NULL
  AND roles.status = 'active'
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON TABLE public.douyin_third_party_components
IS '抖音第三方平台组件票据、组件令牌密文信封及刷新租约。';

COMMENT ON TABLE public.douyin_miniapp_installations
IS '抖音授权小程序、租户绑定、令牌密文信封与运行配置的唯一事实来源。';

COMMIT;

-- Rollback reminder: disable callbacks and session issuance first; drop refresh
-- RPCs before tables; drop installations before components; remove
-- role_permissions before the permission row. Credential token loss requires
-- merchant re-authorization.
