CREATE OR REPLACE FUNCTION public.find_auth_user_by_openid(p_openid text)
RETURNS TABLE (
  id uuid,
  email text,
  openid text,
  unionid text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    users.id,
    users.email::text,
    (users.raw_user_meta_data ->> 'openid')::text AS openid,
    (users.raw_user_meta_data ->> 'unionid')::text AS unionid
  FROM auth.users AS users
  WHERE users.email = (p_openid || '@wechat.local')
     OR users.raw_user_meta_data ->> 'openid' = p_openid
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_openid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_openid(text) TO service_role;
