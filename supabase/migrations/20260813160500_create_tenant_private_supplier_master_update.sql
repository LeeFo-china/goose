-- Rollback: forward-only. Disable private supplier writes and revoke this RPC
-- in a new migration. Existing supplier master changes remain audit facts.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.update_tenant_private_supplier_master(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_name text,
  p_legal_name text,
  p_unified_social_credit_code text,
  p_unified_social_credit_code_provided boolean,
  p_supplier_type text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_credit_code text := CASE
    WHEN p_unified_social_credit_code IS NULL THEN NULL
    ELSE nullif(upper(btrim(p_unified_social_credit_code)), '')
  END;
BEGIN
  IF p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_unified_social_credit_code_provided IS NULL
    OR (p_name IS NOT NULL AND btrim(p_name) = '')
    OR (p_legal_name IS NOT NULL AND btrim(p_legal_name) = '')
    OR (p_supplier_type IS NOT NULL AND p_supplier_type NOT IN (
      'manufacturer', 'brand_agent', 'distributor', 'retailer', 'other'
    ))
    OR (
      p_name IS NULL
      AND p_legal_name IS NULL
      AND NOT p_unified_social_credit_code_provided
      AND p_supplier_type IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
    AND setting.private_supplier_writes_enabled
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  SELECT relationship.*
  INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'tenant_supplier_not_found',
      'error_code', 'TENANT_SUPPLIER_NOT_FOUND'
    );
  END IF;

  SELECT supplier.*
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_relationship.supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_found',
      'error_code', 'SUPPLIER_NOT_FOUND'
    );
  END IF;
  IF v_supplier.ownership_scope <> 'tenant'
    OR v_supplier.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_CONFLICT';
  END IF;
  IF v_supplier.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', v_supplier.version
    );
  END IF;

  BEGIN
    UPDATE public.suppliers AS supplier
    SET name = COALESCE(btrim(p_name), supplier.name),
        legal_name = COALESCE(btrim(p_legal_name), supplier.legal_name),
        unified_social_credit_code = CASE
          WHEN NOT p_unified_social_credit_code_provided
            THEN supplier.unified_social_credit_code
          ELSE v_credit_code
        END,
        supplier_type = COALESCE(p_supplier_type, supplier.supplier_type),
        updated_by_employee_id = p_actor_employee_id,
        version = supplier.version + 1
    WHERE supplier.id = v_supplier.id
    RETURNING * INTO v_supplier;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  RETURN jsonb_build_object(
    'status', 'updated',
    'supplier', to_jsonb(v_supplier),
    'version', v_supplier.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_private_supplier_master(
  uuid, uuid, integer, text, text, text, boolean, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_private_supplier_master(
  uuid, uuid, integer, text, text, text, boolean, text, uuid, uuid
) TO service_role;

COMMIT;
