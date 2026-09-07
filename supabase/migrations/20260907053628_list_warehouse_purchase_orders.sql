-- Stage B order identity and paged read support. No historical facts rewritten.
-- Rollback: close warehouse procurement entry points and deploy a forward
-- correction; keep order identity immutable and retain all order/ledger facts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION pg_temp.stage_b_order_replace(p_source text, p_old text, p_new text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old = '' OR (length(p_source)-length(replace(p_source,p_old,'')))/length(p_old) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WAREHOUSE_ORDER_PATCH_SOURCE_MISMATCH', DETAIL=left(p_old,120);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

DO $identity$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.validate_supplier_purchase_order_scope()'::regprocedure);
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '  PERFORM project.id',
    '  IF NEW.destination_type = ''warehouse'' THEN
    PERFORM warehouse.id FROM public.warehouses AS warehouse
      WHERE warehouse.id = NEW.warehouse_id AND warehouse.tenant_id = NEW.tenant_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = ''P0001'', MESSAGE = ''WAREHOUSE_NOT_FOUND'';
    END IF;
  ELSE
  PERFORM project.id');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '  PERFORM relationship.id', '  END IF;
  PERFORM relationship.id');
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.prevent_submitted_supplier_purchase_order_mutation()'::regprocedure);
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    'IF NEW.id IS DISTINCT FROM OLD.id',
    'IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.destination_type IS DISTINCT FROM OLD.destination_type
    OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id');
  EXECUTE v_definition;
END;
$identity$;

DROP TRIGGER supplier_purchase_orders_validate_scope ON public.supplier_purchase_orders;
CREATE TRIGGER supplier_purchase_orders_validate_scope
BEFORE INSERT OR UPDATE OF tenant_id, project_id, destination_type, warehouse_id, tenant_supplier_id, supplier_id
ON public.supplier_purchase_orders FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_purchase_order_scope();

DO $list$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.list_supplier_purchase_orders(uuid,uuid[],integer,integer,text,text,uuid,uuid,text)'::regprocedure);
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    'p_keyword text DEFAULT NULL::text)',
    'p_keyword text DEFAULT NULL::text, p_include_warehouse boolean DEFAULT false, p_destination_type text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '  IF p_status IS NOT NULL',
    '  IF p_tenant_id IS NULL OR p_include_warehouse IS NULL
    OR (p_destination_type IS NOT NULL AND p_destination_type NOT IN (''project'',''warehouse''))
    OR (p_project_id IS NOT NULL AND p_warehouse_id IS NOT NULL)
    OR (p_destination_type = ''project'' AND p_warehouse_id IS NOT NULL)
    OR (p_destination_type = ''warehouse'' AND p_project_id IS NOT NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = ''22023'', MESSAGE = ''PROCUREMENT_DESTINATION_INVALID'';
  END IF;
  IF p_status IS NOT NULL');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    'AND COALESCE(array_length(p_visible_project_ids, 1), 0) = 0',
    'AND COALESCE(array_length(p_visible_project_ids, 1), 0) = 0
    AND NOT p_include_warehouse');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '      purchase_order.project_id,',
    '      purchase_order.project_id,
      purchase_order.destination_type, purchase_order.warehouse_id,
      warehouse.name AS warehouse_name, warehouse.status AS warehouse_status,');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '    JOIN public.projects AS project
      ON project.id = purchase_order.project_id',
    '    LEFT JOIN public.projects AS project
      ON project.id = purchase_order.project_id AND project.tenant_id = purchase_order.tenant_id
    LEFT JOIN public.warehouses AS warehouse
      ON warehouse.id = purchase_order.warehouse_id AND warehouse.tenant_id = purchase_order.tenant_id');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '        p_visible_project_ids IS NULL
        OR purchase_order.project_id = ANY(p_visible_project_ids)',
    '        (purchase_order.destination_type = ''project'' AND (
          p_visible_project_ids IS NULL OR purchase_order.project_id = ANY(p_visible_project_ids)))
        OR (purchase_order.destination_type = ''warehouse'' AND p_include_warehouse)');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '      AND (p_project_id IS NULL OR purchase_order.project_id = p_project_id)',
    '      AND (p_project_id IS NULL OR purchase_order.project_id = p_project_id)
      AND (p_destination_type IS NULL OR purchase_order.destination_type = p_destination_type)
      AND (p_warehouse_id IS NULL OR purchase_order.warehouse_id = p_warehouse_id)');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '        ''project_id'', paged.project_id,',
    '        ''project_id'', paged.project_id,
        ''destination_type'', paged.destination_type, ''warehouse_id'', paged.warehouse_id,');
  v_definition := pg_temp.stage_b_order_replace(v_definition,
    '        ''project'', jsonb_build_object(
          ''id'', paged.project_id,
          ''name'', paged.project_name,
          ''status'', paged.project_status
        ),',
    '        ''project'', CASE WHEN paged.project_id IS NULL THEN NULL ELSE jsonb_build_object(
          ''id'', paged.project_id, ''name'', paged.project_name, ''status'', paged.project_status) END,
        ''warehouse'', CASE WHEN paged.warehouse_id IS NULL THEN NULL ELSE jsonb_build_object(
          ''id'', paged.warehouse_id, ''name'', paged.warehouse_name, ''status'', paged.warehouse_status) END,');
  DROP FUNCTION public.list_supplier_purchase_orders(uuid,uuid[],integer,integer,text,text,uuid,uuid,text);
  EXECUTE v_definition;
END;
$list$;
REVOKE ALL ON FUNCTION public.list_supplier_purchase_orders(uuid,uuid[],integer,integer,text,text,uuid,uuid,text,boolean,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_supplier_purchase_orders(uuid,uuid[],integer,integer,text,text,uuid,uuid,text,boolean,text,uuid)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
