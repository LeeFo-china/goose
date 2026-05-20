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
    employees.user_id IS NOT NULL AS has_admin_web,
    wechat_oauth.openid IS NOT NULL AS has_wechat_mini,
    CASE
      WHEN wechat_oauth.openid IS NULL THEN NULL
      WHEN length(wechat_oauth.openid) <= 8 THEN wechat_oauth.openid
      ELSE left(wechat_oauth.openid, 4) || '...' || right(wechat_oauth.openid, 4)
    END AS wechat_openid_masked
  FROM public.employees AS employees
  LEFT JOIN LATERAL (
    SELECT user_oauth_identities.openid
    FROM public.user_oauth_identities AS user_oauth_identities
    WHERE user_oauth_identities.user_id = employees.user_id
      AND user_oauth_identities.platform = 'wechat_mini'
      AND user_oauth_identities.status = 'active'
    ORDER BY user_oauth_identities.bound_at DESC, user_oauth_identities.created_at DESC
    LIMIT 1
  ) AS wechat_oauth ON true
  WHERE employees.id = ANY(p_employee_ids);
$$;

REVOKE ALL ON FUNCTION public.list_employee_login_bindings(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_employee_login_bindings(uuid[]) TO service_role;

DROP FUNCTION IF EXISTS public.find_auth_user_by_openid(text);
DROP TABLE IF EXISTS public.wechat_identities;
