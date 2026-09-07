-- Stage B read-only optimization. Keep exact count and deterministic pagination
-- in one SQL snapshot; attach wide display fields only to the selected page.
-- No facts change. Rollback via a new migration restoring the prior read body
-- and, if needed, dropping this non-unique index. Do not rewrite applied files.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

-- Warehouse/SKU indexes cannot provide the tenant-wide occurred_at ordering.
-- Creation is transactional; schedule the development/production application
-- separately because an ordinary CREATE INDEX blocks writes while building.
CREATE INDEX inventory_transactions_tenant_occurred_idx
ON public.inventory_transactions(tenant_id,occurred_at DESC,id DESC);

DO $inventory_read_paging$
DECLARE
  v_function regprocedure := 'public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
  v_start integer;
  v_end integer;
  v_old text;
  v_new text;
BEGIN
  -- Preserve any later source/security changes by rejecting an unexpected body.
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=v_function)<>'ac6d0860c67b7dff665f027dcf3c304c' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_READ_PAGING_SOURCE_MISMATCH';
  END IF;
  v_start := strpos(v_definition,'  WITH filtered AS MATERIALIZED (');
  v_end := strpos(v_definition,E'  SELECT\n    counted.total,');
  IF v_start=0 OR v_end<=v_start THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_READ_PAGING_SOURCE_MISMATCH';
  END IF;
  v_old := substring(v_definition FROM v_start FOR v_end-v_start);
  v_new := $query$  WITH filtered AS NOT MATERIALIZED (
    -- All former display INNER JOINs are backed by non-null, validated FKs.
    -- Count/page can therefore read only fact IDs without changing membership.
    SELECT transaction.id,transaction.occurred_at
    FROM public.inventory_transactions AS transaction
    WHERE transaction.tenant_id = p_tenant_id
      AND (p_warehouse_id IS NULL OR transaction.warehouse_id = p_warehouse_id)
      AND (
        p_supplier_sku_id IS NULL
        OR transaction.supplier_sku_id = p_supplier_sku_id
      )
      AND (
        p_transaction_type IS NULL
        OR transaction.transaction_type = p_transaction_type
      )
  ),
  counted AS MATERIALIZED (
    SELECT COUNT(*)::integer AS total FROM filtered
  ),
  page_ids AS MATERIALIZED (
    SELECT id,occurred_at FROM filtered
    ORDER BY occurred_at DESC,id DESC
    OFFSET v_offset
    LIMIT v_page_size
  ),
  page_rows AS MATERIALIZED (
    SELECT
      transaction.id,
      transaction.tenant_id,
      transaction.warehouse_id,
      warehouse.name AS warehouse_name,
      transaction.supplier_sku_id,
      supplier_sku.sku_code,
      supplier_sku.name AS sku_name,
      transaction.transaction_type,
      transaction.quantity_delta,
      transaction.unit_cost,
      transaction.value_delta,
      transaction.source_type,
      transaction.source_id,
      transaction.project_id,
      transaction.cost_category_id,
      transaction.occurred_at,
      transaction.created_by_employee_id,
      employee.name AS created_by_employee_name,
      transaction.created_at
    FROM page_ids
    JOIN public.inventory_transactions AS transaction ON transaction.id=page_ids.id
    JOIN public.warehouses AS warehouse
      ON warehouse.id=transaction.warehouse_id AND warehouse.tenant_id=transaction.tenant_id
    JOIN public.supplier_skus AS supplier_sku ON supplier_sku.id=transaction.supplier_sku_id
    JOIN public.employees AS employee
      ON employee.id=transaction.created_by_employee_id AND employee.tenant_id=transaction.tenant_id
  )
$query$;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$inventory_read_paging$;

-- CREATE OR REPLACE preserves the existing function signature and ACL.
NOTIFY pgrst,'reload schema';
COMMIT;
