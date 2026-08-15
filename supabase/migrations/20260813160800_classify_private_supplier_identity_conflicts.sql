-- Rollback: forward-only. Replace the guarded private supplier command in a
-- new migration. Existing private supplier identities remain unchanged.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.create_tenant_private_supplier_guarded(
  p_tenant_id uuid, p_name text, p_legal_name text,
  p_unified_social_credit_code text, p_supplier_type text,
  p_code_source text, p_internal_supplier_code text, p_allocation_id uuid,
  p_primary_contact jsonb, p_address jsonb, p_actor_user_id uuid,
  p_actor_employee_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_credit_code text := nullif(upper(btrim(p_unified_social_credit_code)), '');
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN public.create_tenant_private_supplier(
      p_tenant_id, p_name, p_legal_name, p_unified_social_credit_code,
      p_supplier_type, p_code_source, p_internal_supplier_code,
      p_allocation_id, p_primary_contact, p_address, p_actor_user_id,
      p_actor_employee_id, p_idempotency_key
    );
  END IF;

  IF v_credit_code IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'tenant-private-supplier-credit:' || p_tenant_id::text || ':' ||
          v_credit_code,
        0
      )
    );
    IF EXISTS (
      SELECT 1
      FROM public.suppliers AS supplier
      WHERE supplier.ownership_scope = 'tenant'
        AND supplier.owner_tenant_id = p_tenant_id
        AND upper(btrim(supplier.unified_social_credit_code)) = v_credit_code
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDENTITY_CONFLICT',
        CONSTRAINT = 'suppliers_tenant_credit_code_unique_idx';
    END IF;
  END IF;

  RETURN public.create_tenant_private_supplier(
    p_tenant_id, p_name, p_legal_name, p_unified_social_credit_code,
    p_supplier_type, p_code_source, p_internal_supplier_code,
    p_allocation_id, p_primary_contact, p_address, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_private_supplier(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_tenant_private_supplier_guarded(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_private_supplier_guarded(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text)
TO service_role;

COMMIT;
