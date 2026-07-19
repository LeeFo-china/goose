-- Rollback: revoke/drop claim_douyin_authorizer_token_force_refresh(uuid, text).
CREATE OR REPLACE FUNCTION public.claim_douyin_authorizer_token_force_refresh(
  p_installation_id uuid,
  p_expected_access_token_ciphertext text
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
  IF p_installation_id IS NULL
    OR p_expected_access_token_ciphertext IS NULL
    OR btrim(p_expected_access_token_ciphertext) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZER_TOKEN_FORCE_REFRESH_CLAIM_INVALID';
  END IF;

  RETURN QUERY
  UPDATE public.douyin_miniapp_installations AS installation
  SET
    token_refresh_claim_token = v_claim_token,
    token_refresh_claim_expires_at = v_now + interval '30 seconds',
    token_refresh_last_error = NULL
  WHERE installation.id = p_installation_id
    AND installation.access_token_ciphertext = p_expected_access_token_ciphertext
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status IN ('authorized_unbound', 'active')
    AND installation.refresh_token_expires_at > v_now
    AND (
      installation.token_refresh_claim_token IS NULL
      OR installation.token_refresh_claim_expires_at <= v_now
    )
  RETURNING
    installation.token_refresh_claim_token,
    installation.token_refresh_claim_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_douyin_authorizer_token_force_refresh(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_douyin_authorizer_token_force_refresh(uuid, text)
TO service_role;

COMMENT ON FUNCTION public.claim_douyin_authorizer_token_force_refresh(uuid, text)
IS 'Claims one serialized refresh lease for the exact authorizer token rejected by Douyin.';
