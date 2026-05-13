CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    users.id,
    users.email::text
  FROM auth.users AS users
  WHERE lower(users.email::text) = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;

UPDATE public.employees AS employees
SET user_id = users.id
FROM auth.users AS users
WHERE employees.user_id IS NULL
  AND users.raw_user_meta_data ->> 'source' = 'admin_web'
  AND users.raw_user_meta_data ->> 'employee_id' = employees.id::text;
