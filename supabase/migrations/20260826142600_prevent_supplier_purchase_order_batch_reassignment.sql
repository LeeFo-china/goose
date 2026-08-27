-- Rollback: forward-only. Keep recorded purchase order ownership immutable.
-- If the batch feature is disabled, revoke its command entry points and hide
-- its UI. Remove this guard only in a separately reviewed migration after
-- proving no batch-owned purchase orders exist.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION
  public.prevent_supplier_purchase_order_batch_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.purchase_batch_id IS DISTINCT FROM OLD.purchase_batch_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_OWNERSHIP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.prevent_supplier_purchase_order_batch_reassignment()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_orders_prevent_batch_reassignment
BEFORE UPDATE OF purchase_batch_id
ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION
  public.prevent_supplier_purchase_order_batch_reassignment();

COMMIT;
