-- Warehouse workflows use tenant permissions, never a synthetic project.
-- Published workflow graphs stay immutable; the default != over_budget edge
-- already routes not_applicable to approved_end. Rollback: close the warehouse
-- gate and deploy a reviewed forward fix; preserve all workflow/purchase facts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

CREATE FUNCTION pg_temp.stage_b_workflow_replace(p_source text,p_old text,p_new text,p_count integer DEFAULT 1)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))/length(p_old)<>p_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_WORKFLOW_PATCH_SOURCE_MISMATCH',DETAIL=left(p_old,150);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

CREATE FUNCTION public.__gooes_has_tenant_procurement_permission(p_tenant_id uuid,p_employee_id uuid,p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees AS employee
    JOIN public.permissions AS permission ON permission.code=p_permission_code AND permission.status='active'
    WHERE employee.id=p_employee_id AND employee.tenant_id=p_tenant_id AND employee.status='active'
      AND NOT EXISTS(SELECT 1 FROM public.employee_permission_overrides AS denied
        WHERE denied.employee_id=employee.id AND denied.permission_id=permission.id AND denied.effect='deny')
      AND (EXISTS(SELECT 1 FROM public.employee_permission_overrides AS allowed
        WHERE allowed.employee_id=employee.id AND allowed.permission_id=permission.id AND allowed.effect='allow')
        OR EXISTS(SELECT 1 FROM public.employee_roles AS binding
          JOIN public.roles AS role ON role.id=binding.role_id AND role.status='active'
            AND (role.tenant_id=p_tenant_id OR role.tenant_id IS NULL)
          JOIN public.role_permissions AS granted ON granted.role_id=role.id AND granted.permission_id=permission.id
          WHERE binding.employee_id=employee.id))
  );
$$;
REVOKE ALL ON FUNCTION public.__gooes_has_tenant_procurement_permission(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.__gooes_assert_warehouse_workflow_actor(
  p_tenant_id uuid,p_actor_user_id uuid,p_employee_id uuid,p_context jsonb,p_required_permission text
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.assert_supplier_purchase_order_actor(p_tenant_id,p_actor_user_id,p_employee_id);
  IF p_context->>'destination_type' IS DISTINCT FROM 'warehouse'
    OR p_context->'project_id' IS DISTINCT FROM 'null'::jsonb
    OR COALESCE(p_context->>'warehouse_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PROCUREMENT_DESTINATION_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE tenant_id=p_tenant_id AND id=(p_context->>'warehouse_id')::uuid)
    OR NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,p_required_permission)
    OR NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,'inventory.warehouse.manage')
    OR (p_required_permission IS DISTINCT FROM 'supplier.purchase-requisition.manage' AND (
      NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,'supplier.purchase-requisition.view')
      OR NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,'inventory.warehouse.view')))
  THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='FORBIDDEN'; END IF;
  -- Submit/withdraw need both manage permissions; review also needs both view
  -- permissions and its node permission, matching the API's distinct roles.
  -- Successful retries use frozen identity and current actor permissions, not
  -- the current operational gate or warehouse active status.
END;
$$;
REVOKE ALL ON FUNCTION public.__gooes_assert_warehouse_workflow_actor(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

DO $candidates$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.__gooes_workflow_node_has_candidate(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid)'::regprocedure);
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    $old$      AND (
        v_permission_code IS NULL
        OR public.__gooes_employee_has_project_permission_scope(
          p_tenant_id, employee.id, p_project_id, v_permission_code
        )
      )
      AND public.__gooes_employee_has_project_permission_scope(
        p_tenant_id, employee.id, p_project_id, v_project_permission
      )$old$,
    $new$      AND (
        (p_subject_type='supplier_purchase_batch' AND p_context->>'destination_type'='warehouse'
          AND public.__gooes_has_tenant_procurement_permission(p_tenant_id,employee.id,
            CASE p_node->>'node_key' WHEN 'purchase_review' THEN 'supplier.purchase-requisition.approve' WHEN 'finance_review' THEN 'finance.budget.manage' END)
          AND (v_permission_code IS NULL OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,employee.id,v_permission_code))
          AND public.__gooes_has_tenant_procurement_permission(p_tenant_id,employee.id,'supplier.purchase-requisition.view')
          AND public.__gooes_has_tenant_procurement_permission(p_tenant_id,employee.id,'inventory.warehouse.view')
          AND public.__gooes_has_tenant_procurement_permission(p_tenant_id,employee.id,'inventory.warehouse.manage'))
        OR (COALESCE(p_context->>'destination_type','project')='project'
          AND (v_permission_code IS NULL OR public.__gooes_employee_has_project_permission_scope(
            p_tenant_id,employee.id,p_project_id,v_permission_code))
          AND public.__gooes_employee_has_project_permission_scope(p_tenant_id,employee.id,p_project_id,v_project_permission))
      )$new$);
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.__gooes_supplier_workflow_reachable_approvals(jsonb,jsonb)'::regprocedure);
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    'p_context->>''budget_status'' NOT IN (''within_budget'', ''over_budget'')',
    'p_context->>''budget_status'' NOT IN (''within_budget'', ''over_budget'', ''not_applicable'')');
  EXECUTE v_definition;
END;
$candidates$;

DO $submit$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.submit_supplier_purchase_batch_with_workflow(uuid,uuid,integer,uuid,uuid,text)'::regprocedure);
  v_marker := E'  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n    ''supplier-purchase-batch-id:''';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  PERFORM warehouse.id FROM public.warehouses AS warehouse
    JOIN public.supplier_purchase_batches AS batch ON batch.warehouse_id=warehouse.id AND batch.tenant_id=warehouse.tenant_id
    WHERE batch.id=p_batch_id AND batch.tenant_id=p_tenant_id AND batch.destination_type='warehouse' FOR SHARE OF warehouse;
$patch$ || v_marker);
  v_marker := E'  PERFORM project.id\n  FROM public.projects AS project';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  IF v_batch.destination_type='warehouse' THEN
    PERFORM public.assert_warehouse_procurement_destination(p_tenant_id,v_batch.destination_type,v_batch.project_id,v_batch.warehouse_id);
    PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,to_jsonb(v_batch),'supplier.purchase-requisition.manage');
  ELSE
$patch$ || v_marker);
  v_marker := '  PERFORM public.assert_supplier_purchase_order_actor(';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,E'  END IF;\n\n' || v_marker);
  v_marker := E'  v_budget_preflight :=\n    public.__gooes_supplier_purchase_batch_budget_preflight(\n      p_tenant_id, p_batch_id, v_batch.project_id\n    );';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  IF v_batch.destination_type='warehouse' THEN
    v_budget_preflight := jsonb_build_object('budget_status','not_applicable','budget_snapshot','{}'::jsonb);
  ELSE
$patch$ || v_marker || E'\n  END IF;');
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    '''project_id'', v_batch.project_id,',
    $patch$'project_id', v_batch.project_id,
      'destination_type',v_batch.destination_type,'warehouse_id',v_batch.warehouse_id,
      'warehouse_name',(SELECT warehouse.name FROM public.warehouses AS warehouse WHERE warehouse.id=v_batch.warehouse_id AND warehouse.tenant_id=p_tenant_id),$patch$,2);
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    'v_batch.budget_status NOT IN (''within_budget'', ''over_budget'')',
    'v_batch.budget_status NOT IN (''within_budget'', ''over_budget'', ''not_applicable'')');
  v_marker := E'    RETURN v_event.result || pg_catalog.jsonb_build_object(\n      ''idempotent'', true\n    );';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$    IF v_event.result->'batch'->>'destination_type'='warehouse' THEN
      PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_event.result->'batch','supplier.purchase-requisition.manage');
    END IF;
$patch$ || v_marker);
  EXECUTE v_definition;
END;
$submit$;

DO $review$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.__gooes_complete_supplier_purchase_batch_workflow_task_v1(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_marker := E'    OR v_instance.context->>''project_id'' IS DISTINCT FROM\n      v_batch.project_id::text';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,v_marker || $patch$
    OR COALESCE(v_instance.context->>'destination_type','project') IS DISTINCT FROM v_batch.destination_type
    OR v_instance.context->>'warehouse_id' IS DISTINCT FROM v_batch.warehouse_id::text$patch$);
  v_marker := E'  IF v_task.assignee_permission_code IS NOT NULL\n    AND NOT public.__gooes_employee_has_project_permission_scope(';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  IF v_batch.destination_type='warehouse' THEN
    PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_instance.context,v_required_permission);
    IF v_task.assignee_permission_code IS NOT NULL AND NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,v_task.assignee_permission_code)
    THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='FORBIDDEN'; END IF;
    IF NOT v_adopted_legacy_event THEN
      PERFORM public.assert_warehouse_procurement_destination(p_tenant_id,v_batch.destination_type,v_batch.project_id,v_batch.warehouse_id);
    END IF;
  ELSE
$patch$ || v_marker);
  v_marker := E'  IF v_task.node_key = ''finance_review''\n    AND v_instance.context->>''budget_status'' <> ''over_budget''';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,E'  END IF;\n' || v_marker);
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    'AND v_instance.context->>''budget_status'' = ''within_budget'')',
    'AND v_instance.context->>''budget_status'' IN (''within_budget'',''not_applicable''))');
  EXECUTE v_definition;

  -- Exact replay returns in the outer wrapper before v1 authorization. Read
  -- the matched task's frozen instance, never the now-editable batch identity.
  v_definition := pg_get_functiondef('public.complete_supplier_purchase_batch_workflow_task(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,'  v_batch_round integer;',
    E'  v_batch_round integer;\n  v_frozen_context jsonb;\n  v_frozen_node_key text;');
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,
    E'      batch.approval_round\n    INTO v_task_batch_version, v_instance_round, v_batch_round',
    E'      batch.approval_round, instance.context, task.node_key\n    INTO v_task_batch_version, v_instance_round, v_batch_round, v_frozen_context, v_frozen_node_key');
  v_marker := E'      RETURN COALESCE(\n        v_event.request->''workflow_task_result'',';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$      IF v_frozen_context->>'destination_type'='warehouse' THEN
        PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_frozen_context,
          CASE v_frozen_node_key WHEN 'purchase_review' THEN 'supplier.purchase-requisition.approve' WHEN 'finance_review' THEN 'finance.budget.manage' END);
      END IF;
$patch$ || v_marker);
  EXECUTE v_definition;
END;
$review$;

DO $withdraw$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.withdraw_supplier_purchase_batch_workflow(uuid,uuid,integer,text,uuid,uuid,text)'::regprocedure);
  v_marker := E'  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n    ''supplier-purchase-batch-id:''';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  PERFORM settings.tenant_id FROM public.tenant_supplier_settings AS settings WHERE settings.tenant_id=p_tenant_id FOR UPDATE;
  PERFORM warehouse.id FROM public.warehouses AS warehouse
    JOIN public.supplier_purchase_batches AS batch ON batch.warehouse_id=warehouse.id AND batch.tenant_id=warehouse.tenant_id
    WHERE batch.id=p_batch_id AND batch.tenant_id=p_tenant_id AND batch.destination_type='warehouse' FOR SHARE OF warehouse;
$patch$ || v_marker);
  v_marker := '    OR (v_instance.context->>''batch_version'')::integer <> v_batch.version';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,v_marker || $patch$
    OR COALESCE(v_instance.context->>'destination_type','project') IS DISTINCT FROM v_batch.destination_type
    OR v_instance.context->>'project_id' IS DISTINCT FROM v_batch.project_id::text
    OR v_instance.context->>'warehouse_id' IS DISTINCT FROM v_batch.warehouse_id::text$patch$);
  v_marker := '  IF NOT public.__gooes_employee_has_project_permission_scope(';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$  IF v_batch.destination_type='warehouse' THEN
    PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_instance.context,'supplier.purchase-requisition.manage');
  ELSE
$patch$ || v_marker);
  v_marker := E'  IF NOT EXISTS (\n    SELECT 1\n    FROM public.tenant_supplier_settings AS setting';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,E'  END IF;\n' || v_marker);
  v_marker := E'    RETURN v_event.result || pg_catalog.jsonb_build_object(\n      ''idempotent'', true\n    );';
  v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_marker,
    $patch$    IF v_event.result->'batch'->>'destination_type'='warehouse' THEN
      PERFORM public.__gooes_assert_warehouse_workflow_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_event.result->'batch','supplier.purchase-requisition.manage');
    END IF;
$patch$ || v_marker);
  EXECUTE v_definition;
END;
$withdraw$;

DO $task_lists$
DECLARE v_name text; v_signature text; v_definition text; v_projects text; v_indent text; v_old text; v_new text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['list_accessible_supplier_purchase_batch_workflow_tasks','list_accessible_workflow_tasks_with_supplier_scope'] LOOP
    v_signature := CASE WHEN v_name='list_accessible_supplier_purchase_batch_workflow_tasks'
      THEN '(uuid,uuid,text[],text[],uuid[],text,text,integer,integer)'
      ELSE '(uuid,uuid,text[],text[],text,text,text,uuid,boolean,uuid,uuid[],integer,integer)' END;
    v_projects := CASE WHEN v_name='list_accessible_supplier_purchase_batch_workflow_tasks' THEN 'v_visible_project_ids' ELSE 'v_supplier_visible_project_ids' END;
    v_indent := CASE WHEN v_name='list_accessible_supplier_purchase_batch_workflow_tasks' THEN '    ' ELSE '        ' END;
    v_definition := pg_get_functiondef(('public.' || v_name || v_signature)::regprocedure);
    v_definition := pg_temp.stage_b_workflow_replace(v_definition,
      '''current_node_snapshot'', instance.current_node_snapshot',
      '''current_node_snapshot'', instance.current_node_snapshot, ''context'', instance.context');
    IF v_name='list_accessible_supplier_purchase_batch_workflow_tasks' THEN
      v_definition := pg_temp.stage_b_workflow_replace(v_definition,
        '    AND cardinality(v_visible_project_ids) = 0 THEN',
        '    AND cardinality(v_visible_project_ids) = 0 AND NOT (''inventory.warehouse.view''=ANY(v_permission_codes) AND ''supplier.purchase-requisition.view''=ANY(v_permission_codes)) THEN');
    END IF;
    v_old := v_indent || E'AND (\n' || v_indent || '  ' || v_projects || E' IS NULL\n'
      || v_indent || '  OR batch.project_id = ANY(' || v_projects || E')\n' || v_indent || ')';
    v_new := format($scope$AND (
      (v_status='pending' AND (
        (batch.destination_type='project' AND (%1$s IS NULL OR batch.project_id=ANY(%1$s)))
        OR (batch.destination_type='warehouse' AND 'inventory.warehouse.view'=ANY(v_permission_codes) AND 'supplier.purchase-requisition.view'=ANY(v_permission_codes))))
      OR (v_status<>'pending' AND (
        (COALESCE(instance.context->>'destination_type','project')='project'
          AND instance.context->>'warehouse_id' IS NULL
          AND instance.context->>'project_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND (%1$s IS NULL OR CASE WHEN instance.context->>'project_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (instance.context->>'project_id')::uuid END=ANY(%1$s)))
        OR (instance.context->>'destination_type'='warehouse' AND instance.context->'project_id'='null'::jsonb
          AND instance.context->>'warehouse_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND 'inventory.warehouse.view'=ANY(v_permission_codes) AND 'supplier.purchase-requisition.view'=ANY(v_permission_codes))))
    )$scope$,v_projects);
    v_definition := pg_temp.stage_b_workflow_replace(v_definition,v_old,v_indent || v_new);
    EXECUTE v_definition;
  END LOOP;
END;
$task_lists$;

COMMIT;
