CREATE OR REPLACE FUNCTION public.verify_wechat_identity_binding(
  p_user_id uuid,
  p_openid text,
  p_tenant_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  oauth_matched boolean,
  customer_membership_matched boolean,
  employee_membership_matched boolean,
  employee_user_matched boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_oauth_identities AS oauth
      WHERE oauth.user_id = p_user_id
        AND oauth.platform = 'wechat_mini'
        AND oauth.openid = p_openid
        AND oauth.status = 'active'
    ) AS oauth_matched,
    CASE
      WHEN p_tenant_id IS NULL OR p_customer_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.user_business_memberships AS membership
        WHERE membership.user_id = p_user_id
          AND membership.tenant_id = p_tenant_id
          AND membership.identity_type = 'customer'
          AND membership.identity_id = p_customer_id
          AND membership.status = 'active'
      )
    END AS customer_membership_matched,
    CASE
      WHEN p_tenant_id IS NULL OR p_employee_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.user_business_memberships AS membership
        WHERE membership.user_id = p_user_id
          AND membership.tenant_id = p_tenant_id
          AND membership.identity_type = 'employee'
          AND membership.identity_id = p_employee_id
          AND membership.status = 'active'
      )
    END AS employee_membership_matched,
    CASE
      WHEN p_tenant_id IS NULL OR p_employee_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.employees AS employee
        WHERE employee.id = p_employee_id
          AND employee.user_id = p_user_id
          AND employee.tenant_id = p_tenant_id
      )
    END AS employee_user_matched;
$$;

GRANT EXECUTE ON FUNCTION public.verify_wechat_identity_binding(uuid, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_wechat_identity_binding(uuid, text, uuid, uuid, uuid) TO service_role;
