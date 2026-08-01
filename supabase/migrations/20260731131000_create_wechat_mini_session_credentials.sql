-- Rollback: deploy a forward migration that first disables all virtual-payment
-- session consumers, revokes EXECUTE on the five credential RPCs, and drops
-- tr_user_oauth_identities_revoke_wechat_mini_session. Then drop the RPCs,
-- trigger function, and table. Historical ciphertext can be deleted only after
-- confirming no virtual order still requires a session refresh. This migration
-- intentionally stores no plaintext session_key and grants no direct table
-- access to API or client roles.

BEGIN;

CREATE TABLE public.wechat_mini_session_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_identity_id uuid NOT NULL
    REFERENCES public.user_oauth_identities(id) ON DELETE CASCADE,
  openid_hash text NOT NULL,
  encrypted_session_key text NOT NULL,
  encryption_key_version integer NOT NULL,
  session_revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  obtained_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  invalidated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_mini_session_credentials_openid_hash_check
    CHECK (openid_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wechat_mini_session_credentials_ciphertext_check
    CHECK (
      btrim(encrypted_session_key) <> ''
      AND char_length(encrypted_session_key) <= 2048
    ),
  CONSTRAINT wechat_mini_session_credentials_encryption_key_version_check
    CHECK (encryption_key_version > 0),
  CONSTRAINT wechat_mini_session_credentials_revision_check
    CHECK (session_revision > 0),
  CONSTRAINT wechat_mini_session_credentials_status_check
    CHECK (status IN ('active', 'invalid', 'revoked')),
  CONSTRAINT wechat_mini_session_credentials_invalidation_check
    CHECK (
      (status = 'active' AND invalidated_at IS NULL)
      OR (status IN ('invalid', 'revoked') AND invalidated_at IS NOT NULL)
    ),
  CONSTRAINT wechat_mini_session_credentials_last_used_check
    CHECK (last_used_at IS NULL OR last_used_at >= obtained_at),
  CONSTRAINT wechat_mini_session_credentials_identity_revision_key
    UNIQUE (oauth_identity_id, session_revision)
);

CREATE UNIQUE INDEX wechat_mini_session_credentials_active_identity_idx
ON public.wechat_mini_session_credentials(oauth_identity_id)
WHERE status = 'active';

CREATE INDEX wechat_mini_session_credentials_openid_hash_idx
ON public.wechat_mini_session_credentials(openid_hash, status);

CREATE TRIGGER tr_wechat_mini_session_credentials_updated_at
BEFORE UPDATE ON public.wechat_mini_session_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wechat_mini_session_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wechat_mini_session_credentials FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wechat_mini_session_credentials
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.rotate_wechat_mini_session_credential(
  p_oauth_identity_id uuid,
  p_user_id uuid,
  p_openid text,
  p_openid_hash text,
  p_encrypted_session_key text,
  p_encryption_key_version integer
)
RETURNS SETOF public.wechat_mini_session_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity public.user_oauth_identities%ROWTYPE;
  v_next_revision integer;
  v_credential public.wechat_mini_session_credentials%ROWTYPE;
BEGIN
  IF p_oauth_identity_id IS NULL
    OR p_user_id IS NULL
    OR btrim(COALESCE(p_openid, '')) = ''
    OR COALESCE(p_openid_hash, '') !~ '^[0-9a-f]{64}$'
    OR btrim(COALESCE(p_encrypted_session_key, '')) = ''
    OR COALESCE(p_encryption_key_version, 0) <= 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_MINI_SESSION_ROTATION_INPUT_INVALID';
  END IF;

  SELECT identity.*
  INTO v_identity
  FROM public.user_oauth_identities AS identity
  WHERE identity.id = p_oauth_identity_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_identity.user_id <> p_user_id
    OR v_identity.platform <> 'wechat_mini'
    OR v_identity.openid <> p_openid
    OR v_identity.status <> 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_MINI_SESSION_IDENTITY_MISMATCH';
  END IF;

  SELECT COALESCE(MAX(credential.session_revision), 0) + 1
  INTO v_next_revision
  FROM public.wechat_mini_session_credentials AS credential
  WHERE credential.oauth_identity_id = p_oauth_identity_id;

  UPDATE public.wechat_mini_session_credentials AS credential
  SET
    status = 'revoked',
    invalidated_at = now()
  WHERE credential.oauth_identity_id = p_oauth_identity_id
    AND credential.status = 'active';

  INSERT INTO public.wechat_mini_session_credentials (
    oauth_identity_id,
    openid_hash,
    encrypted_session_key,
    encryption_key_version,
    session_revision,
    status,
    obtained_at
  )
  VALUES (
    p_oauth_identity_id,
    p_openid_hash,
    p_encrypted_session_key,
    p_encryption_key_version,
    v_next_revision,
    'active',
    now()
  )
  RETURNING * INTO v_credential;

  RETURN NEXT v_credential;
END;
$$;

CREATE FUNCTION public.get_wechat_mini_session_credential(
  p_oauth_identity_id uuid,
  p_user_id uuid,
  p_openid text
)
RETURNS SETOF public.wechat_mini_session_credentials
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT credential.*
  FROM public.wechat_mini_session_credentials AS credential
  JOIN public.user_oauth_identities AS identity
    ON identity.id = credential.oauth_identity_id
  WHERE credential.oauth_identity_id = p_oauth_identity_id
    AND identity.user_id = p_user_id
    AND identity.platform = 'wechat_mini'
    AND identity.openid = p_openid
    AND identity.status = 'active'
  ORDER BY credential.session_revision DESC
  LIMIT 1;
$$;

CREATE FUNCTION public.touch_wechat_mini_session_credential(
  p_credential_id uuid,
  p_session_revision integer,
  p_user_id uuid,
  p_openid text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.wechat_mini_session_credentials AS credential
  SET last_used_at = now()
  WHERE credential.id = p_credential_id
    AND credential.session_revision = p_session_revision
    AND credential.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.user_oauth_identities AS identity
      WHERE identity.id = credential.oauth_identity_id
        AND identity.user_id = p_user_id
        AND identity.platform = 'wechat_mini'
        AND identity.openid = p_openid
        AND identity.status = 'active'
    );

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.invalidate_wechat_mini_session_credential(
  p_credential_id uuid,
  p_session_revision integer,
  p_user_id uuid,
  p_openid text
)
RETURNS SETOF public.wechat_mini_session_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_credential public.wechat_mini_session_credentials%ROWTYPE;
BEGIN
  UPDATE public.wechat_mini_session_credentials AS credential
  SET
    status = 'invalid',
    invalidated_at = now()
  WHERE credential.id = p_credential_id
    AND credential.session_revision = p_session_revision
    AND credential.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.user_oauth_identities AS identity
      WHERE identity.id = credential.oauth_identity_id
        AND identity.user_id = p_user_id
        AND identity.platform = 'wechat_mini'
        AND identity.openid = p_openid
        AND identity.status = 'active'
    )
  RETURNING * INTO v_credential;

  IF FOUND THEN
    RETURN NEXT v_credential;
  END IF;
END;
$$;

CREATE FUNCTION public.revoke_wechat_mini_session_credentials(
  p_oauth_identity_id uuid
)
RETURNS SETOF public.wechat_mini_session_credentials
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.wechat_mini_session_credentials AS credential
  SET
    status = 'revoked',
    invalidated_at = now()
  WHERE credential.oauth_identity_id = p_oauth_identity_id
    AND credential.status = 'active'
  RETURNING credential.*;
$$;

CREATE FUNCTION public.revoke_wechat_mini_session_on_oauth_disable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status IN ('disabled', 'unbound')
  THEN
    UPDATE public.wechat_mini_session_credentials AS credential
    SET
      status = 'revoked',
      invalidated_at = now()
    WHERE credential.oauth_identity_id = NEW.id
      AND credential.status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_user_oauth_identities_revoke_wechat_mini_session
AFTER UPDATE OF status ON public.user_oauth_identities
FOR EACH ROW
EXECUTE FUNCTION public.revoke_wechat_mini_session_on_oauth_disable();

REVOKE ALL ON FUNCTION public.rotate_wechat_mini_session_credential(
  uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_wechat_mini_session_credential(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.touch_wechat_mini_session_credential(
  uuid, integer, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invalidate_wechat_mini_session_credential(
  uuid, integer, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_wechat_mini_session_credentials(uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_wechat_mini_session_on_oauth_disable()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rotate_wechat_mini_session_credential(
  uuid, uuid, text, text, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_wechat_mini_session_credential(uuid, uuid, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_wechat_mini_session_credential(
  uuid, integer, uuid, text
)
TO service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_wechat_mini_session_credential(
  uuid, integer, uuid, text
)
TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_wechat_mini_session_credentials(uuid)
TO service_role;

COMMENT ON TABLE public.wechat_mini_session_credentials IS
  'Server-only encrypted WeChat mini-program session credentials; never expose to clients or JWTs';
COMMENT ON COLUMN public.wechat_mini_session_credentials.openid_hash IS
  'Lowercase SHA-256 hash used only for indexed correlation without repeating plaintext openid';
COMMENT ON COLUMN public.wechat_mini_session_credentials.encrypted_session_key IS
  'Versioned AES-256-GCM envelope; plaintext session_key is forbidden';

COMMIT;
