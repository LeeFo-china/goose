DROP FUNCTION IF EXISTS public.list_wechat_login_memberships(uuid);

CREATE OR REPLACE FUNCTION public.list_wechat_login_memberships(p_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  tenant_id uuid,
  identity_type text,
  identity_id uuid,
  status text,
  is_default boolean,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_user_id uuid,
  customer_origin text,
  customer_claimed_at timestamptz,
  tenant_name text,
  tenant_slug text,
  tenant_status text,
  employee_id uuid,
  employee_user_id uuid,
  employee_name text,
  employee_status text,
  employee_department_id uuid,
  employee_tenant_department_id uuid,
  employee_post_id uuid,
  employee_avatar text,
  department_name text,
  department_code text,
  tenant_department_alias_name text,
  tenant_department_code text,
  post_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    membership.id AS membership_id,
    membership.user_id,
    membership.tenant_id,
    membership.identity_type::text AS identity_type,
    membership.identity_id,
    membership.status::text AS status,
    membership.is_default,
    customer.id AS customer_id,
    customer.name AS customer_name,
    customer.phone AS customer_phone,
    customer.user_id AS customer_user_id,
    customer.customer_origin,
    customer.claimed_at AS customer_claimed_at,
    tenant.name AS tenant_name,
    tenant.slug AS tenant_slug,
    tenant.status::text AS tenant_status,
    employee.id AS employee_id,
    employee.user_id AS employee_user_id,
    employee.name AS employee_name,
    employee.status::text AS employee_status,
    employee.department_id AS employee_department_id,
    employee.tenant_department_id AS employee_tenant_department_id,
    employee.post_id AS employee_post_id,
    employee.avatar AS employee_avatar,
    department.name AS department_name,
    department.code AS department_code,
    tenant_department.alias_name AS tenant_department_alias_name,
    tenant_department.code AS tenant_department_code,
    post.name AS post_name
  FROM public.user_business_memberships AS membership
  LEFT JOIN public.customers AS customer
    ON membership.identity_type = 'customer'
    AND customer.id = membership.identity_id
    AND customer.tenant_id = membership.tenant_id
  LEFT JOIN public.employees AS employee
    ON membership.identity_type = 'employee'
    AND employee.id = membership.identity_id
    AND employee.tenant_id = membership.tenant_id
  LEFT JOIN public.tenants AS tenant
    ON tenant.id = membership.tenant_id
  LEFT JOIN public.departments AS department
    ON department.id = employee.department_id
  LEFT JOIN public.tenant_departments AS tenant_department
    ON tenant_department.id = employee.tenant_department_id
  LEFT JOIN public.posts AS post
    ON post.id = employee.post_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
  ORDER BY membership.is_default DESC, membership.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_wechat_login_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wechat_login_memberships(uuid) TO service_role;
