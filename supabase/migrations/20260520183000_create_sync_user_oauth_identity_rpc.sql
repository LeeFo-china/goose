CREATE OR REPLACE FUNCTION public.sync_user_oauth_identity(
  p_user_id uuid,
  p_platform text,
  p_openid text,
  p_unionid text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  platform text,
  openid text,
  unionid text,
  status text,
  bound_at timestamptz,
  unbound_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.user_oauth_identities%ROWTYPE;
BEGIN
  UPDATE public.user_oauth_identities AS identity
  SET
    user_id = p_user_id,
    unionid = p_unionid,
    status = 'active',
    unbound_at = NULL,
    updated_at = now()
  WHERE identity.platform = p_platform
    AND identity.openid = p_openid
    AND identity.status = 'active'
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.user_oauth_identities (
        user_id,
        platform,
        openid,
        unionid,
        status,
        bound_at,
        unbound_at
      )
      VALUES (
        p_user_id,
        p_platform,
        p_openid,
        p_unionid,
        'active',
        now(),
        NULL
      )
      RETURNING * INTO v_record;
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.user_oauth_identities AS identity
      SET
        user_id = p_user_id,
        unionid = p_unionid,
        status = 'active',
        unbound_at = NULL,
        updated_at = now()
      WHERE identity.platform = p_platform
        AND identity.openid = p_openid
        AND identity.status = 'active'
      RETURNING * INTO v_record;
    END;
  END IF;

  RETURN QUERY
  SELECT
    v_record.id,
    v_record.user_id,
    v_record.platform,
    v_record.openid,
    v_record.unionid,
    v_record.status,
    v_record.bound_at,
    v_record.unbound_at,
    v_record.created_at,
    v_record.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_oauth_identity(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_oauth_identity(uuid, text, text, text) TO service_role;
