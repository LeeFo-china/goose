-- User-authorized one-time copy of the fixed published default workflows to Tianxi.
-- Preserve the old purchase version; no running instances are rewritten.
-- Rollback requires a forward migration using the recorded previous_version_id.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $copy$
DECLARE
  v_tenant constant uuid := '8440bb1e-8b6c-44cb-9ef0-5558b0460609';
  v_definition constant uuid := 'c8e0506c-09d4-4197-a2d2-9e3fbae02424';
  v_result jsonb;
BEGIN
  -- Other environments may not contain this production tenant.
  PERFORM id FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  LOCK TABLE public.workflow_definitions,public.workflow_versions,public.workflow_nodes,
    public.workflow_edges,public.workflow_definition_bindings,public.workflow_instances
    IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM public.workflow_definitions WHERE tenant_id=v_tenant) <> 1
    OR EXISTS(SELECT 1 FROM public.workflow_instances WHERE tenant_id=v_tenant)
    OR EXISTS(SELECT 1 FROM public.workflow_definition_bindings WHERE tenant_id=v_tenant)
    OR (SELECT count(*) FROM public.workflow_versions WHERE tenant_id=v_tenant) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.workflow_definitions d JOIN public.workflow_versions v ON v.id=d.active_version_id
      WHERE d.id=v_definition AND d.tenant_id=v_tenant AND d.workflow_key='supplier_purchase_batch_approval'
        AND d.status='active' AND v.id='a51304b6-9f4e-4bc0-84f8-06893c7b81d5'
        AND md5(v.snapshot::text)='6c00cd8cc892009fc20ec6a00e1abc95'
    ) OR (SELECT md5(jsonb_agg(to_jsonb(n) ORDER BY n.node_key)::text)
          FROM public.workflow_nodes n WHERE n.definition_id=v_definition)
      IS DISTINCT FROM '98c48368ccea0bb490391c6415d8c8ad'
    OR (SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text)
          FROM public.workflow_edges e WHERE e.definition_id=v_definition)
      IS DISTINCT FROM 'db341009dac029689a0b56b6f44d1e08' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='TIANXI_WORKFLOW_COPY_STATE_CHANGED';
  END IF;
  v_result := public.__gooes_apply_default_workflow_templates(v_tenant,v_definition);
  IF jsonb_array_length(v_result) <> 5
    OR (SELECT count(*) FROM public.workflow_definitions WHERE tenant_id=v_tenant AND status='active') <> 5
    OR (SELECT count(*) FROM public.workflow_versions WHERE tenant_id=v_tenant) <> 6 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='TIANXI_WORKFLOW_COPY_RESULT_INVALID';
  END IF;
END;
$copy$;
COMMIT;
