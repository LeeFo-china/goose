-- Rollback: forward-only. Recreate the affected functions and grants in a new
-- migration. Do not restore global platform lookups or unguarded private writes.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.assert_platform_supplier(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM supplier.id
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
    AND supplier.ownership_scope = 'platform'
    AND supplier.owner_tenant_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_NOT_FOUND';
  END IF;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_hardened text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_supplier_onboarding(uuid,text,text,text,text,text,text,uuid,uuid,date,date,text,text,text,integer,uuid,uuid,text)'::regprocedure
  ) INTO v_definition;
  v_hardened := pg_catalog.replace(
    v_definition,
    'WHERE upper(btrim(supplier.unified_social_credit_code)) = v_credit_code
    LIMIT 1',
    'WHERE supplier.ownership_scope = ''platform''
      AND supplier.owner_tenant_id IS NULL
      AND upper(btrim(supplier.unified_social_credit_code)) = v_credit_code
    LIMIT 1'
  );
  IF v_hardened = v_definition THEN
    RAISE EXCEPTION 'create_supplier_onboarding ownership patch did not match';
  END IF;
  EXECUTE v_hardened;

  SELECT pg_catalog.pg_get_functiondef(
    'public.create_platform_supplier(uuid,text,text,text,text,text,integer,uuid,uuid,text)'::regprocedure
  ) INTO v_definition;
  v_hardened := pg_catalog.replace(
    v_definition,
    'IF EXISTS (SELECT 1 FROM public.suppliers AS supplier WHERE supplier.id = p_supplier_id OR supplier.code = p_code) THEN',
    'IF EXISTS (
    SELECT 1 FROM public.suppliers AS supplier
    WHERE supplier.id = p_supplier_id
      OR (
        supplier.ownership_scope = ''platform''
        AND supplier.owner_tenant_id IS NULL
        AND upper(btrim(supplier.code)) = upper(btrim(p_code))
      )
  ) THEN'
  );
  IF v_hardened = v_definition THEN
    RAISE EXCEPTION 'create_platform_supplier ownership patch did not match';
  END IF;
  EXECUTE v_hardened;
END;
$$;

REVOKE ALL ON public.platform_supplier_directory
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.platform_supplier_directory TO service_role;

CREATE FUNCTION public.update_tenant_private_supplier_master_guarded(
  p_tenant_id uuid, p_tenant_supplier_id uuid, p_expected_version integer,
  p_name text, p_legal_name text, p_unified_social_credit_code text,
  p_unified_social_credit_code_provided boolean, p_supplier_type text,
  p_actor_user_id uuid, p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_credit_code text := CASE
    WHEN p_unified_social_credit_code IS NULL THEN NULL
    ELSE nullif(upper(btrim(p_unified_social_credit_code)), '')
  END;
BEGIN
  IF p_unified_social_credit_code_provided AND v_credit_code IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'tenant-private-supplier-credit:' || p_tenant_id::text || ':' ||
          v_credit_code,
        0
      )
    );
  END IF;
  RETURN public.update_tenant_private_supplier_master(
    p_tenant_id, p_tenant_supplier_id, p_expected_version, p_name,
    p_legal_name, p_unified_social_credit_code,
    p_unified_social_credit_code_provided, p_supplier_type,
    p_actor_user_id, p_actor_employee_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_private_supplier_master(
  uuid, uuid, integer, text, text, text, boolean, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_tenant_private_supplier_master_guarded(
  uuid, uuid, integer, text, text, text, boolean, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_private_supplier_master_guarded(
  uuid, uuid, integer, text, text, text, boolean, text, uuid, uuid
) TO service_role;

COMMIT;
