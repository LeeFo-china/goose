-- Rollback: forward-only. This migration relaxes tenant-proxy constraints so
-- platform operators can maintain platform-owned products and SKUs, and adds
-- guarded platform command functions. Rolling back is destructive: drop the
-- two platform command functions, restore the operation_source checks and the
-- acting_tenant_id/proxy_reason NOT NULL columns, and remove any platform
-- products/SKUs that were created in the meantime.

BEGIN;

ALTER TABLE public.supplier_products
  ALTER COLUMN acting_tenant_id DROP NOT NULL,
  ALTER COLUMN proxy_reason DROP NOT NULL,
  DROP CONSTRAINT supplier_products_operation_source_check,
  ADD CONSTRAINT supplier_products_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'platform'));

ALTER TABLE public.supplier_skus
  ALTER COLUMN acting_tenant_id DROP NOT NULL,
  ALTER COLUMN proxy_reason DROP NOT NULL,
  DROP CONSTRAINT supplier_skus_operation_source_check,
  ADD CONSTRAINT supplier_skus_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'platform'));

CREATE FUNCTION public.create_platform_supplier_product(
  p_product_id uuid,
  p_supplier_id uuid,
  p_product_code text,
  p_name text,
  p_category_id uuid,
  p_brand_id uuid,
  p_description text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.supplier_products%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_supplier_id IS NULL
    OR p_product_code IS NULL OR btrim(p_product_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_category_id IS NULL OR p_brand_id IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  INSERT INTO public.supplier_products (
    id, supplier_id, product_code, name, category_id, brand_id, description,
    status, version, ownership_scope, owner_tenant_id, acting_tenant_id,
    acting_employee_id, operation_source, proxy_reason,
    created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_product_id, p_supplier_id, p_product_code, btrim(p_name),
    p_category_id, p_brand_id, p_description, 'draft', 1,
    'platform', NULL, NULL, p_actor_employee_id, 'platform', NULL,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_product;

  RETURN jsonb_build_object(
    'status', 'created',
    'product', to_jsonb(v_product),
    'version', v_product.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_platform_supplier_product(
  uuid, uuid, text, text, uuid, uuid, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_platform_supplier_sku(
  p_sku_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_sku_code text,
  p_name text,
  p_specification text,
  p_model text,
  p_purchase_unit_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sku public.supplier_skus%ROWTYPE;
BEGIN
  IF p_sku_id IS NULL OR p_supplier_id IS NULL OR p_supplier_product_id IS NULL
    OR p_sku_code IS NULL OR btrim(p_sku_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_purchase_unit_id IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  INSERT INTO public.supplier_skus (
    id, supplier_id, supplier_product_id, sku_code, name, specification, model,
    purchase_unit_id, base_unit_id, base_unit_conversion, status, version,
    ownership_scope, owner_tenant_id, acting_tenant_id, acting_employee_id,
    operation_source, proxy_reason, created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_sku_id, p_supplier_id, p_supplier_product_id, p_sku_code, btrim(p_name),
    p_specification, p_model, p_purchase_unit_id, p_purchase_unit_id, 1,
    'draft', 1, 'platform', NULL, NULL, p_actor_employee_id, 'platform', NULL,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_sku;

  RETURN jsonb_build_object(
    'status', 'created',
    'sku', to_jsonb(v_sku),
    'version', v_sku.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_platform_supplier_sku(
  uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
