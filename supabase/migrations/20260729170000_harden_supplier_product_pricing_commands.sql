-- Serialize supplier product/SKU status changes with price publication and
-- validate the parent product carried by SKU mutation routes.
--
-- Rollback: a forward rollback may drop the two lock triggers and the
-- mutate_supplier_sku_for_product wrapper after every API instance has stopped
-- calling it. Keep the original mutate_supplier_sku command and business data.

BEGIN;

CREATE FUNCTION public.lock_supplier_price_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'supplier-price-publish:' || NEW.supplier_id::text,
        6720240729160000
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_products_price_publication_lock
BEFORE UPDATE OF status ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.lock_supplier_price_publication();

CREATE TRIGGER supplier_skus_price_publication_lock
BEFORE UPDATE OF status ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.lock_supplier_price_publication();

CREATE FUNCTION public.mutate_supplier_sku_for_product(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_sku_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM 1
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
    AND sku.supplier_product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  RETURN public.mutate_supplier_sku(
    p_tenant_id,
    p_supplier_id,
    p_sku_id,
    p_action,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_supplier_price_publication()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

COMMIT;
