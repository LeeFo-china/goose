\set ON_ERROR_STOP on
-- Disposable local PostgreSQL only. All fixtures and mutations roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_legacy uuid := gen_random_uuid();
  v_conflict uuid := gen_random_uuid();
  v_customer uuid;
  v_versions jsonb;
  v_result jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug,status) VALUES
    (v_tenant,'默认流程测试','workflow-template-'||v_tenant,'active'),
    (v_other,'隔离测试','workflow-template-'||v_other,'active'),
    (v_legacy,'历史租户测试','workflow-template-'||v_legacy,'active'),
    (v_conflict,'冲突回滚测试','workflow-template-'||v_conflict,'active');
  PERFORM public.initialize_default_decoration_tenant(v_tenant,NULL,NULL,NULL);
  IF (SELECT count(*) FROM public.workflow_definitions WHERE tenant_id=v_tenant AND status='active' AND active_version_id IS NOT NULL) <> 5 THEN
    RAISE EXCEPTION 'expected five published default workflows on new tenant';
  END IF;
  IF (SELECT count(*) FROM public.workflow_nodes WHERE tenant_id=v_tenant) <> 37
    OR (SELECT count(*) FROM public.workflow_edges WHERE tenant_id=v_tenant) <> 35
    OR (SELECT count(*) FROM public.workflow_versions WHERE tenant_id=v_tenant) <> 5 THEN
    RAISE EXCEPTION 'expected complete graphs and one published version per definition';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_definition_bindings b JOIN public.workflow_definitions d ON d.id=b.definition_id
    WHERE b.tenant_id=v_tenant AND b.is_default AND b.selectable AND d.workflow_key='construction_main'
  ) THEN RAISE EXCEPTION 'default construction binding missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workflow_versions v CROSS JOIN LATERAL jsonb_array_elements(v.snapshot->'nodes') n
    WHERE v.tenant_id=v_tenant AND (n->>'tenant_id' <> v_tenant::text OR n->>'definition_id' <> v.definition_id::text)
  ) OR EXISTS (
    SELECT 1 FROM public.workflow_versions v CROSS JOIN LATERAL jsonb_array_elements(v.snapshot->'edges') e
    WHERE v.tenant_id=v_tenant AND (e->>'tenant_id' <> v_tenant::text OR e->>'definition_id' <> v.definition_id::text
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.snapshot->'nodes') n WHERE n->>'id'=e->>'source_node_id')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.snapshot->'nodes') n WHERE n->>'id'=e->>'target_node_id'))
  ) THEN RAISE EXCEPTION 'snapshot foreign tenant or broken edge'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_versions WHERE tenant_id=v_tenant
      AND snapshot->>'workflow_key'='supplier_purchase_batch_approval'
      AND snapshot->>'subject_type'='supplier_purchase_batch'
  ) THEN RAISE EXCEPTION 'purchase subject metadata lost'; END IF;

  SELECT jsonb_agg(id ORDER BY id) INTO v_versions FROM public.workflow_versions WHERE tenant_id=v_tenant;
  SELECT id INTO v_customer FROM public.workflow_definitions WHERE tenant_id=v_tenant AND workflow_key='customer_main';
  UPDATE public.workflow_nodes SET title='租户自定义标题' WHERE definition_id=v_customer AND node_key='potential';
  UPDATE public.workflow_definitions SET status='archived' WHERE id=v_customer;
  PERFORM public.initialize_default_decoration_tenant(v_tenant,NULL,NULL,NULL);
  PERFORM public.__gooes_apply_default_workflow_templates(v_tenant);
  IF (SELECT jsonb_agg(id ORDER BY id) FROM public.workflow_versions WHERE tenant_id=v_tenant) IS DISTINCT FROM v_versions
    OR (SELECT status FROM public.workflow_definitions WHERE id=v_customer) <> 'archived'
    OR (SELECT title FROM public.workflow_nodes WHERE definition_id=v_customer AND node_key='potential') <> '租户自定义标题'
    OR (SELECT count(*) FROM public.tenant_template_applications WHERE tenant_id=v_tenant AND template_code='default_decoration_workflows') <> 1 THEN
    RAISE EXCEPTION 'repeat initialization overwrote customization or republished';
  END IF;

  PERFORM public.initialize_default_decoration_tenant(v_other,NULL,NULL,NULL);
  IF EXISTS (
    SELECT 1 FROM public.workflow_versions a JOIN public.workflow_versions b ON b.tenant_id=v_other
    CROSS JOIN LATERAL jsonb_array_elements(a.snapshot->'nodes') n
    CROSS JOIN LATERAL jsonb_array_elements(b.snapshot->'nodes') m
    WHERE a.tenant_id=v_tenant AND n->>'id'=m->>'id'
  ) THEN RAISE EXCEPTION 'tenants share node IDs'; END IF;
  PERFORM public.__gooes_initialize_default_decoration_tenant_20260830(v_legacy,NULL,NULL,NULL);
  PERFORM public.initialize_default_decoration_tenant(v_legacy,NULL,NULL,NULL);
  IF (SELECT count(*) FROM public.workflow_definitions WHERE tenant_id=v_legacy) <> 1
    OR EXISTS(SELECT 1 FROM public.tenant_template_applications WHERE tenant_id=v_legacy AND template_code='default_decoration_workflows') THEN
    RAISE EXCEPTION 'legacy tenant unexpectedly backfilled';
  END IF;

  INSERT INTO public.workflow_definitions(tenant_id,workflow_key,name,category)
    VALUES(v_conflict,'customer_main','现有流程','sales');
  BEGIN
    PERFORM public.initialize_default_decoration_tenant(v_conflict,NULL,NULL,NULL);
    RAISE EXCEPTION 'conflict unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'WORKFLOW_TEMPLATE_DEFINITION_CONFLICT' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.tenant_template_applications WHERE tenant_id=v_conflict)
    OR EXISTS(SELECT 1 FROM public.tenant_departments WHERE tenant_id=v_conflict)
    OR EXISTS(SELECT 1 FROM public.workflow_versions WHERE tenant_id=v_conflict)
    OR (SELECT count(*) FROM public.workflow_definitions WHERE tenant_id=v_conflict) <> 1 THEN
    RAISE EXCEPTION 'conflict left partially initialized organization or workflows';
  END IF;

  IF has_function_privilege('anon','public.__gooes_apply_default_workflow_templates(uuid,uuid)','execute')
    OR has_function_privilege('authenticated','public.__gooes_apply_default_workflow_templates(uuid,uuid)','execute')
    OR has_function_privilege('service_role','public.__gooes_apply_default_workflow_templates(uuid,uuid)','execute')
    OR has_function_privilege('authenticated','public.initialize_default_decoration_tenant(uuid,text,text,uuid)','execute')
    OR NOT has_function_privilege('service_role','public.initialize_default_decoration_tenant(uuid,text,text,uuid)','execute') THEN
    RAISE EXCEPTION 'template function privilege boundary incorrect';
  END IF;
  RAISE NOTICE 'PASS: new tenant, graphs, binding, snapshots, metadata, idempotency, customization, isolation, legacy preservation, atomic rollback, privileges';
END;
$test$;
ROLLBACK;
