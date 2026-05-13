DO $$
DECLARE
  inserted_oauth_count integer := 0;
  inserted_customer_membership_count integer := 0;
  inserted_employee_membership_count integer := 0;
BEGIN
  INSERT INTO public.user_oauth_identities (
    user_id,
    platform,
    openid,
    unionid,
    status,
    bound_at,
    created_at,
    updated_at
  )
  SELECT
    identities.auth_user_id,
    'wechat_mini',
    identities.openid,
    identities.unionid,
    'active',
    identities.created_at,
    identities.created_at,
    identities.created_at
  FROM public.wechat_identities AS identities
  INNER JOIN auth.users AS users
    ON users.id = identities.auth_user_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_oauth_count = ROW_COUNT;

  WITH ranked_customers AS (
    SELECT
      customers.user_id,
      customers.tenant_id,
      customers.id AS identity_id,
      customers.created_at,
      row_number() OVER (
        PARTITION BY customers.user_id, customers.tenant_id
        ORDER BY customers.created_at ASC NULLS LAST, customers.id ASC
      ) AS row_no
    FROM public.customers AS customers
    INNER JOIN auth.users AS users
      ON users.id = customers.user_id
    WHERE customers.user_id IS NOT NULL
      AND customers.tenant_id IS NOT NULL
  )
  INSERT INTO public.user_business_memberships (
    user_id,
    tenant_id,
    identity_type,
    identity_id,
    status,
    is_default,
    created_at,
    updated_at
  )
  SELECT
    ranked_customers.user_id,
    ranked_customers.tenant_id,
    'customer',
    ranked_customers.identity_id,
    'active',
    ranked_customers.row_no = 1,
    COALESCE(ranked_customers.created_at, now()),
    now()
  FROM ranked_customers
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_customer_membership_count = ROW_COUNT;

  WITH ranked_employees AS (
    SELECT
      employees.user_id,
      employees.tenant_id,
      employees.id AS identity_id,
      employees.status,
      employees.created_at,
      row_number() OVER (
        PARTITION BY employees.user_id, employees.tenant_id
        ORDER BY employees.created_at ASC NULLS LAST, employees.id ASC
      ) AS row_no
    FROM public.employees AS employees
    INNER JOIN auth.users AS users
      ON users.id = employees.user_id
    WHERE employees.user_id IS NOT NULL
      AND employees.tenant_id IS NOT NULL
  )
  INSERT INTO public.user_business_memberships (
    user_id,
    tenant_id,
    identity_type,
    identity_id,
    status,
    is_default,
    created_at,
    updated_at
  )
  SELECT
    ranked_employees.user_id,
    ranked_employees.tenant_id,
    'employee',
    ranked_employees.identity_id,
    CASE WHEN ranked_employees.status = 'active' THEN 'active' ELSE 'disabled' END,
    ranked_employees.row_no = 1,
    COALESCE(ranked_employees.created_at, now()),
    now()
  FROM ranked_employees
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_employee_membership_count = ROW_COUNT;

  RAISE NOTICE 'Backfilled user_oauth_identities rows: %', inserted_oauth_count;
  RAISE NOTICE 'Backfilled customer memberships rows: %', inserted_customer_membership_count;
  RAISE NOTICE 'Backfilled employee memberships rows: %', inserted_employee_membership_count;
END $$;
