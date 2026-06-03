CREATE OR REPLACE FUNCTION public.verify_wechat_customer_bootstrap(
  p_user_id uuid,
  p_openid text,
  p_tenant_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_recent_logs_per_project integer DEFAULT 2
)
RETURNS TABLE (
  oauth_matched boolean,
  customer_membership_matched boolean,
  employee_membership_matched boolean,
  employee_user_matched boolean,
  customer_context jsonb,
  user_profile jsonb,
  home_projects jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    verification.oauth_matched,
    verification.customer_membership_matched,
    verification.employee_membership_matched,
    verification.employee_user_matched,
    verification.customer_context,
    verification.user_profile,
    CASE
      WHEN verification.oauth_matched
        AND verification.customer_membership_matched
        AND verification.employee_membership_matched
        AND verification.employee_user_matched
        AND p_tenant_id IS NOT NULL
        AND p_customer_id IS NOT NULL
      THEN (
        SELECT COALESCE(jsonb_agg(to_jsonb(home_project)), '[]'::jsonb)
        FROM public.list_customer_home_projects(
          p_tenant_id,
          p_customer_id,
          p_page,
          p_page_size,
          p_recent_logs_per_project
        ) AS home_project
      )
      ELSE '[]'::jsonb
    END AS home_projects
  FROM public.verify_wechat_identity_binding(
    p_user_id,
    p_openid,
    p_tenant_id,
    p_customer_id,
    p_employee_id
  ) AS verification;
$$;

GRANT EXECUTE ON FUNCTION public.verify_wechat_customer_bootstrap(uuid, text, uuid, uuid, uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_wechat_customer_bootstrap(uuid, text, uuid, uuid, uuid, integer, integer, integer) TO service_role;
