CREATE OR REPLACE FUNCTION public.list_employee_login_bindings(p_employee_ids uuid[])
RETURNS TABLE (
  employee_id uuid,
  auth_user_id uuid,
  has_admin_web boolean,
  has_wechat_mini boolean,
  wechat_openid_masked text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    employees.id AS employee_id,
    employees.user_id AS auth_user_id,
    COALESCE(
      users.raw_user_meta_data ->> 'source' = 'admin_web'
        OR lower(users.email::text) = lower('admin.' || employees.id::text || '@gooes.local'),
      false
    ) AS has_admin_web,
    wechat_identities.openid IS NOT NULL AS has_wechat_mini,
    CASE
      WHEN wechat_identities.openid IS NULL THEN NULL
      WHEN length(wechat_identities.openid) <= 8 THEN wechat_identities.openid
      ELSE left(wechat_identities.openid, 4) || '...' || right(wechat_identities.openid, 4)
    END AS wechat_openid_masked
  FROM public.employees AS employees
  LEFT JOIN auth.users AS users
    ON users.id = employees.user_id
  LEFT JOIN public.wechat_identities AS wechat_identities
    ON wechat_identities.auth_user_id = employees.user_id
  WHERE employees.id = ANY(p_employee_ids);
$$;

REVOKE ALL ON FUNCTION public.list_employee_login_bindings(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_employee_login_bindings(uuid[]) TO service_role;
