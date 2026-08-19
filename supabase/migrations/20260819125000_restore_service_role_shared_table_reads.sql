-- Rollback: forward-only. Do not revoke these SELECT grants until the API uses
-- a dedicated least-privilege role or audited RPC boundary; revoking them now
-- would recreate the employee login and supplier-product outage.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

GRANT SELECT ON TABLE public.employees TO service_role;
GRANT SELECT ON TABLE public.supplier_products TO service_role;

DO $$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.employees', 'SELECT') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_EMPLOYEES_SELECT_REQUIRED';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.supplier_products',
    'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_SUPPLIER_PRODUCTS_SELECT_REQUIRED';
  END IF;
END;
$$;

COMMIT;
