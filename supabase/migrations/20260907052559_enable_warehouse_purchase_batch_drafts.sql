-- Stage B: reuse the existing catalog/pricing and draft command implementations.
-- Rollback: disable warehouse_procurement_enabled first, roll back clients,
-- then use a reviewed forward migration. Never delete purchase/audit facts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.assert_warehouse_procurement_destination(
  p_tenant_id uuid, p_destination_type text, p_project_id uuid, p_warehouse_id uuid
)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_status text;
BEGIN
  IF p_tenant_id IS NULL OR p_destination_type IS NULL
    OR p_destination_type NOT IN ('project', 'warehouse')
    OR (p_destination_type = 'project' AND (p_project_id IS NULL OR p_warehouse_id IS NOT NULL))
    OR (p_destination_type = 'warehouse' AND (p_project_id IS NOT NULL OR p_warehouse_id IS NULL))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROCUREMENT_DESTINATION_INVALID';
  END IF;
  IF p_destination_type = 'project' THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_supplier_settings
    WHERE tenant_id = p_tenant_id AND warehouse_procurement_enabled
      AND module_enabled AND procurement_snapshot_v1_enabled AND purchase_batch_workflow_enabled
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WAREHOUSE_PROCUREMENT_NOT_ENABLED';
  END IF;
  SELECT status INTO v_status FROM public.warehouses
    WHERE tenant_id = p_tenant_id AND id = p_warehouse_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WAREHOUSE_NOT_FOUND';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WAREHOUSE_INACTIVE';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_warehouse_procurement_destination(uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Every patch must match the effective definition exactly; fail closed on
-- schema drift instead of restoring an older implementation over later fixes.
CREATE FUNCTION pg_temp.stage_b_replace(p_source text, p_old text, p_new text, p_count integer DEFAULT 1)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old = '' OR (length(p_source) - length(replace(p_source, p_old, ''))) / length(p_old) <> p_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WAREHOUSE_DRAFT_PATCH_SOURCE_MISMATCH',
      DETAIL = left(p_old, 120);
  END IF;
  RETURN replace(p_source, p_old, p_new);
END;
$$;

DO $catalog$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.resolve_supplier_purchase_batch_catalog(uuid,uuid,text,uuid,uuid,uuid,timestamptz,integer,integer)'::regprocedure);
  v_definition := pg_temp.stage_b_replace(v_definition,
    'p_page_size integer DEFAULT 20)',
    'p_page_size integer DEFAULT 20, p_destination_type text DEFAULT ''project''::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
  v_definition := pg_temp.stage_b_replace(v_definition,
    'p_tenant_id IS NULL OR p_project_id IS NULL OR p_priced_at IS NULL',
    'p_tenant_id IS NULL OR p_priced_at IS NULL');
  v_definition := pg_temp.stage_b_replace(v_definition,
    '  PERFORM project.id
  FROM public.projects AS project',
    '  PERFORM public.assert_warehouse_procurement_destination(
    p_tenant_id, p_destination_type, p_project_id, p_warehouse_id);
  IF p_destination_type = ''project'' THEN
  PERFORM project.id
  FROM public.projects AS project');
  v_definition := pg_temp.stage_b_replace(v_definition,
    '  WITH eligibility AS MATERIALIZED (',
    '  END IF;
  WITH eligibility AS MATERIALIZED (');
  DROP FUNCTION public.resolve_supplier_purchase_batch_catalog(uuid,uuid,text,uuid,uuid,uuid,timestamptz,integer,integer);
  EXECUTE v_definition;
END;
$catalog$;
REVOKE ALL ON FUNCTION public.resolve_supplier_purchase_batch_catalog(uuid,uuid,text,uuid,uuid,uuid,timestamptz,integer,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_supplier_purchase_batch_catalog(uuid,uuid,text,uuid,uuid,uuid,timestamptz,integer,integer,text,uuid)
  TO service_role;

DO $draft$
DECLARE v_core text; v_wrapper text;
BEGIN
  v_core := pg_get_functiondef(
    'public.__gooes_save_supplier_purchase_batch_draft_v1(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_wrapper := pg_get_functiondef(
    'public.save_supplier_purchase_batch_draft(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_core := pg_temp.stage_b_replace(v_core, 'p_idempotency_key text)',
    'p_idempotency_key text, p_destination_type text DEFAULT ''project''::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
  v_wrapper := pg_temp.stage_b_replace(v_wrapper, 'p_idempotency_key text)',
    'p_idempotency_key text, p_destination_type text DEFAULT ''project''::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
  v_wrapper := pg_temp.stage_b_replace(v_wrapper,
    'p_actor_employee_id, p_idempotency_key',
    'p_actor_employee_id, p_idempotency_key, p_destination_type, p_warehouse_id', 4);
  v_wrapper := pg_temp.stage_b_replace(v_wrapper,
    '  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    ''supplier-purchase-batch-id:'' || p_batch_id::text,',
    '  IF p_destination_type = ''warehouse'' THEN
    -- Same order as workflow submit: settings before batch. Locking settings
    -- after the batch would deadlock with a concurrent submit of this draft.
    PERFORM tenant_id FROM public.tenant_supplier_settings
      WHERE tenant_id = p_tenant_id FOR SHARE;
    PERFORM id FROM public.warehouses
      WHERE tenant_id = p_tenant_id AND id = p_warehouse_id FOR SHARE;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    ''supplier-purchase-batch-id:'' || p_batch_id::text,');
  v_core := pg_temp.stage_b_replace(v_core,
    'p_batch_id IS NULL OR p_tenant_id IS NULL OR p_project_id IS NULL',
    'p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_destination_type IS NULL OR p_destination_type NOT IN (''project'', ''warehouse'')
    OR (p_destination_type = ''project'' AND (p_project_id IS NULL OR p_warehouse_id IS NOT NULL))
    OR (p_destination_type = ''warehouse'' AND (p_project_id IS NOT NULL OR p_warehouse_id IS NULL))');
  -- Keep legacy project fingerprints byte-for-byte compatible with existing
  -- command events; warehouse fingerprints include their complete destination.
  v_core := pg_temp.stage_b_replace(v_core,
    '  v_fingerprint := encode(extensions.digest(',
    '  IF p_destination_type = ''warehouse'' THEN
    v_request := v_request || jsonb_build_object(
      ''destination_type'', p_destination_type, ''warehouse_id'', p_warehouse_id);
  END IF;
  v_fingerprint := encode(extensions.digest(');
  v_core := pg_temp.stage_b_replace(v_core,
    '  PERFORM project.id FROM public.projects AS project
  WHERE project.id = p_project_id AND project.tenant_id = p_tenant_id',
    '  IF p_destination_type = ''warehouse'' THEN
    -- The public wrapper holds settings/warehouse locks through this call.
    PERFORM public.assert_warehouse_procurement_destination(
      p_tenant_id, p_destination_type, p_project_id, p_warehouse_id);
  ELSE
  PERFORM project.id FROM public.projects AS project
  WHERE project.id = p_project_id AND project.tenant_id = p_tenant_id');
  v_core := pg_temp.stage_b_replace(v_core,
    '  v_priced_at := clock_timestamp();',
    '  END IF;
  v_priced_at := clock_timestamp();');
  v_core := pg_temp.stage_b_replace(v_core,
    'id, tenant_id, project_id, reason, expected_delivery_date, remark,',
    'id, tenant_id, destination_type, warehouse_id, project_id, reason, expected_delivery_date, remark,');
  v_core := pg_temp.stage_b_replace(v_core,
    'p_batch_id, p_tenant_id, p_project_id, btrim(p_reason),',
    'p_batch_id, p_tenant_id, p_destination_type, p_warehouse_id, p_project_id, btrim(p_reason),');
  v_core := pg_temp.stage_b_replace(v_core,
    'project_id = p_project_id, reason = btrim(p_reason),',
    'destination_type = p_destination_type, warehouse_id = p_warehouse_id,
      project_id = p_project_id, reason = btrim(p_reason),');
  -- Remove old overloads: defaulted signatures keep old clients working without
  -- ambiguous PostgREST resolution; internal functions remain non-callable.
  DROP FUNCTION public.save_supplier_purchase_batch_draft(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text);
  DROP FUNCTION public.__gooes_save_supplier_purchase_batch_draft_v1(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text);
  EXECUTE v_core;
  EXECUTE v_wrapper;
END;
$draft$;
REVOKE ALL ON FUNCTION public.__gooes_save_supplier_purchase_batch_draft_v1(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_supplier_purchase_batch_draft(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_batch_draft(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text,text,uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
