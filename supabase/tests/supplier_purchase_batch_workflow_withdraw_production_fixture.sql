\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('85000000-0000-4000-8000-000000000002', 'task9-submitter@example.invalid'),
  ('85000000-0000-4000-8000-000000000004', 'task9-reviewer@example.invalid');

INSERT INTO public.tenants (id, name, slug) VALUES (
  '85000000-0000-4000-8000-000000000001',
  'Task9 Production Integration',
  'task9-production-integration'
);
INSERT INTO public.employees (id, name, status, user_id, tenant_id) VALUES
  (
    '85000000-0000-4000-8000-000000000003', 'Task9 Submitter', 'active',
    '85000000-0000-4000-8000-000000000002',
    '85000000-0000-4000-8000-000000000001'
  ),
  (
    '85000000-0000-4000-8000-000000000005', 'Task9 Reviewer', 'active',
    '85000000-0000-4000-8000-000000000004',
    '85000000-0000-4000-8000-000000000001'
  );
INSERT INTO public.projects (id, name, tenant_id, status) VALUES (
  '85000000-0000-4000-8000-000000000006', 'Task9 Project',
  '85000000-0000-4000-8000-000000000001', 'constructing'
);

INSERT INTO public.permissions (
  id, code, module, resource, action, name
) VALUES
  ('85000000-0000-4000-8000-000000000010',
    'supplier.purchase-requisition.manage', 'supplier',
    'purchase-requisition', 'manage', 'Task9 Manage'),
  ('85000000-0000-4000-8000-000000000011',
    'project.update', 'project', 'project', 'update', 'Task9 Project Update'),
  ('85000000-0000-4000-8000-000000000012',
    'supplier.purchase-requisition.approve', 'supplier',
    'purchase-requisition', 'approve', 'Task9 Approve'),
  ('85000000-0000-4000-8000-000000000013',
    'supplier.purchase-requisition.view', 'supplier',
    'purchase-requisition', 'view', 'Task9 View'),
  ('85000000-0000-4000-8000-000000000014',
    'project.read', 'project', 'project', 'read', 'Task9 Project Read');
INSERT INTO public.roles (id, tenant_id, code, name) VALUES
  ('85000000-0000-4000-8000-000000000007',
    '85000000-0000-4000-8000-000000000001',
    'task9_submitter', 'Task9 Submitter'),
  ('85000000-0000-4000-8000-000000000008',
    '85000000-0000-4000-8000-000000000001',
    'task9_reviewer', 'Task9 Reviewer');
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
VALUES
  ('85000000-0000-4000-8000-000000000007',
    '85000000-0000-4000-8000-000000000010', 'all'),
  ('85000000-0000-4000-8000-000000000007',
    '85000000-0000-4000-8000-000000000011', 'all'),
  ('85000000-0000-4000-8000-000000000008',
    '85000000-0000-4000-8000-000000000012', 'all'),
  ('85000000-0000-4000-8000-000000000008',
    '85000000-0000-4000-8000-000000000013', 'all'),
  ('85000000-0000-4000-8000-000000000008',
    '85000000-0000-4000-8000-000000000014', 'all');
INSERT INTO public.employee_roles (employee_id, role_id) VALUES
  ('85000000-0000-4000-8000-000000000003',
    '85000000-0000-4000-8000-000000000007'),
  ('85000000-0000-4000-8000-000000000005',
    '85000000-0000-4000-8000-000000000008');

INSERT INTO public.tenant_supplier_settings (
  tenant_id, module_enabled, require_active_contract_for_new_order,
  enabled_by_employee_id, enabled_at, ownership_reads_enabled,
  private_supplier_writes_enabled, private_catalog_writes_enabled,
  procurement_snapshot_v1_enabled, purchase_batch_workflow_enabled
) VALUES (
  '85000000-0000-4000-8000-000000000001', true, false,
  '85000000-0000-4000-8000-000000000003', now(), true, true, true, true, true
);
SELECT public.__gooes_ensure_supplier_purchase_batch_workflow_template(
  '85000000-0000-4000-8000-000000000001'
);

INSERT INTO public.catalog_categories (
  id, code, name, level, created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id, full_name, is_leaf
) VALUES (
  '85000000-0000-4000-8000-000000000020', 'TASK9_CATEGORY',
  'Task9 Category', 1, '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000001', 'Task9 Category', true
);
INSERT INTO public.catalog_brands (
  id, code, name, created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id, category_id
) VALUES (
  '85000000-0000-4000-8000-000000000021', 'TASK9_BRAND', 'Task9 Brand',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000020'
);
INSERT INTO public.catalog_units (
  id, code, name, symbol, created_by_employee_id, updated_by_employee_id,
  unit_dimension
) VALUES (
  '85000000-0000-4000-8000-000000000022', 'TASK9_PCS', 'Task9 Piece', 'pc',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'count'
);
INSERT INTO public.suppliers (
  id, code, name, legal_name, supplier_type, onboarding_status,
  operational_status, created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id
) VALUES (
  '85000000-0000-4000-8000-000000000023', 'TASK9_SUPPLIER',
  'Task9 Supplier', 'Task9 Supplier Legal', 'manufacturer', 'approved',
  'active', '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000001'
);
INSERT INTO public.tenant_suppliers (
  id, tenant_id, supplier_id, relationship_status, internal_supplier_code,
  created_by_employee_id, updated_by_employee_id
) VALUES (
  '85000000-0000-4000-8000-000000000024',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000023', 'active', 'TASK9_SUPPLIER',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003'
);
INSERT INTO public.supplier_products (
  id, supplier_id, product_code, name, category_id, brand_id, status,
  acting_tenant_id, acting_employee_id, operation_source,
  created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id
) VALUES (
  '85000000-0000-4000-8000-000000000025',
  '85000000-0000-4000-8000-000000000023', 'TASK9_PRODUCT',
  'Task9 Product', '85000000-0000-4000-8000-000000000020',
  '85000000-0000-4000-8000-000000000021', 'draft',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000001'
);
INSERT INTO public.supplier_skus (
  id, supplier_id, supplier_product_id, sku_code, name,
  purchase_unit_id, base_unit_id, base_unit_conversion, status,
  acting_tenant_id, acting_employee_id, operation_source,
  created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id, spec_values
) VALUES (
  '85000000-0000-4000-8000-000000000026',
  '85000000-0000-4000-8000-000000000023',
  '85000000-0000-4000-8000-000000000025', 'TASK9_SKU', 'Task9 SKU',
  '85000000-0000-4000-8000-000000000022',
  '85000000-0000-4000-8000-000000000022', 1, 'active',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000001', '{}'::jsonb
);
UPDATE public.supplier_products
SET status = 'active'
WHERE id = '85000000-0000-4000-8000-000000000025';
INSERT INTO public.supplier_price_lists (
  id, supplier_id, price_list_code, version_number, name,
  lifecycle_status, effective_from, published_at, acting_tenant_id,
  acting_employee_id, operation_source, created_by_employee_id,
  updated_by_employee_id, tenant_id, tenant_supplier_id
) VALUES (
  '85000000-0000-4000-8000-000000000027',
  '85000000-0000-4000-8000-000000000023', 'TASK9_PRICE', 1,
  'Task9 Price', 'draft', now() - interval '1 day', NULL,
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000024'
);
INSERT INTO public.supplier_price_list_items (
  id, supplier_id, supplier_price_list_id, supplier_sku_id,
  purchase_unit_id, base_unit_id, base_unit_conversion, unit_price,
  tax_rate, tax_inclusive, acting_tenant_id, acting_employee_id,
  operation_source, created_by_employee_id, updated_by_employee_id,
  tenant_id, supplier_product_id
) VALUES (
  '85000000-0000-4000-8000-000000000028',
  '85000000-0000-4000-8000-000000000023',
  '85000000-0000-4000-8000-000000000027',
  '85000000-0000-4000-8000-000000000026',
  '85000000-0000-4000-8000-000000000022',
  '85000000-0000-4000-8000-000000000022', 1, 100, 0.13, true,
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000003', 'tenant',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000025'
);
UPDATE public.supplier_price_lists
SET lifecycle_status = 'published', published_at = now(),
  row_version = row_version + 1
WHERE id = '85000000-0000-4000-8000-000000000027';
INSERT INTO public.finance_cost_categories (
  id, tenant_id, code, name, created_by, updated_by
) VALUES (
  '85000000-0000-4000-8000-000000000029',
  '85000000-0000-4000-8000-000000000001', 'task9_material',
  'Task9 Material', '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003'
);
INSERT INTO public.project_cost_budgets (
  id, tenant_id, project_id, cost_category_id, budget_amount,
  created_by, updated_by
) VALUES (
  '85000000-0000-4000-8000-000000000030',
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000006',
  '85000000-0000-4000-8000-000000000029', 100000,
  '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003'
);

DO $integration$
DECLARE
  v_tenant uuid := '85000000-0000-4000-8000-000000000001';
  v_project uuid := '85000000-0000-4000-8000-000000000006';
  v_submit_user uuid := '85000000-0000-4000-8000-000000000002';
  v_submitter uuid := '85000000-0000-4000-8000-000000000003';
  v_review_user uuid := '85000000-0000-4000-8000-000000000004';
  v_reviewer uuid := '85000000-0000-4000-8000-000000000005';
  v_sku uuid := '85000000-0000-4000-8000-000000000026';
  v_cost_category uuid := '85000000-0000-4000-8000-000000000029';
  v_withdraw_batch uuid := '85000000-0000-4000-8000-000000000040';
  v_reject_batch uuid := '85000000-0000-4000-8000-000000000050';
  v_cancel_batch uuid := '85000000-0000-4000-8000-000000000060';
  v_result jsonb;
  v_old_instance uuid;
  v_new_instance uuid;
  v_old_task uuid;
  v_round integer;
  v_status text;
  v_version integer;
BEGIN
  v_result := public.save_supplier_purchase_batch_draft(
    v_withdraw_batch, v_tenant, v_project, 0, 'Task9 withdraw flow', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '2'
    )), v_submit_user, v_submitter, 'production-withdraw-save-1'
  );
  IF v_result->>'status' <> 'saved' OR v_result->>'version' <> '1' THEN
    RAISE EXCEPTION 'real initial save failed: %', v_result;
  END IF;
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_withdraw_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-withdraw-submit-1'
  );
  IF v_result->>'status' <> 'submitted' THEN
    RAISE EXCEPTION 'real initial submit failed: %', v_result;
  END IF;
  SELECT instance.id, task.id
  INTO v_old_instance, v_old_task
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_withdraw_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  v_result := public.withdraw_supplier_purchase_batch_workflow(
    v_tenant, v_withdraw_batch, 2, NULL,
    v_submit_user, v_submitter, 'production-withdraw'
  );
  IF v_result->>'status' <> 'withdrawn' OR v_result->>'version' <> '3' THEN
    RAISE EXCEPTION 'real withdrawal failed: %', v_result;
  END IF;
  v_result := public.save_supplier_purchase_batch_draft(
    v_withdraw_batch, v_tenant, v_project, 3, 'Task9 edited', NULL,
    'after withdrawal', jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '3'
    )), v_submit_user, v_submitter, 'production-withdraw-save-2'
  );
  IF v_result->>'status' <> 'saved' OR v_result->>'version' <> '4' THEN
    RAISE EXCEPTION 'real withdrawn edit failed: %', v_result;
  END IF;
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_withdraw_batch, v_tenant, 4, v_submit_user, v_submitter,
    'production-withdraw-submit-2'
  );
  IF v_result->>'status' <> 'submitted' THEN
    RAISE EXCEPTION 'real withdrawn resubmit failed: %', v_result;
  END IF;
  SELECT instance.id, (instance.context->>'approval_round')::integer
  INTO v_new_instance, v_round
  FROM public.workflow_instances AS instance
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_withdraw_batch::text
    AND instance.status = 'running';
  IF v_new_instance = v_old_instance OR v_round <> 2 THEN
    RAISE EXCEPTION 'withdraw resubmit did not create round 2 instance';
  END IF;
  BEGIN
    PERFORM public.withdraw_supplier_purchase_batch_workflow(
      v_tenant, v_withdraw_batch, 4, NULL,
      v_submit_user, v_submitter, 'production-withdraw-wrong-version');
    RAISE EXCEPTION 'wrong-version withdraw unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT' THEN RAISE; END IF;
  END;
  SELECT status, version INTO v_status, v_version
  FROM public.supplier_purchase_batches WHERE id = v_withdraw_batch;
  IF v_status <> 'pending_approval' OR v_version <> 5
    OR NOT EXISTS (SELECT 1 FROM public.workflow_instances
      WHERE id = v_new_instance AND status = 'running')
  THEN RAISE EXCEPTION 'failed withdrawal mutated production facts'; END IF;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_withdraw_batch, v_old_task, 'approve', NULL, '{}'::jsonb,
      v_review_user, v_reviewer, 'production-withdraw-old-task');
    RAISE EXCEPTION 'withdrawn old task unexpectedly advanced';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE' THEN RAISE; END IF;
  END;

  v_result := public.save_supplier_purchase_batch_draft(
    v_reject_batch, v_tenant, v_project, 0, 'Task9 reject flow', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-reject-save-1'
  );
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_reject_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-reject-submit-1'
  );
  SELECT task.id, instance.id
  INTO v_old_task, v_old_instance
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_reject_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_reject_batch, v_old_task, 'reject', 'Task9 rejected',
    jsonb_build_object('source', 'production'), v_review_user, v_reviewer,
    'production-reject-review'
  );
  IF v_result->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'real reject failed: %', v_result;
  END IF;
  v_result := public.save_supplier_purchase_batch_draft(
    v_reject_batch, v_tenant, v_project, 3, 'Task9 invalid edit', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', '85000000-0000-4000-8000-000000000099'::uuid,
      'cost_category_id', v_cost_category, 'quantity', '1'
    )), v_submit_user, v_submitter, 'production-reject-invalid-save'
  );
  IF v_result->>'status' <> 'price_changed'
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id = v_reject_batch AND status = 'rejected' AND version = 3)
  THEN RAISE EXCEPTION 'failed rejected save was not atomic: %', v_result; END IF;
  v_result := public.save_supplier_purchase_batch_draft(
    v_reject_batch, v_tenant, v_project, 3, 'Task9 corrected edit', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '2'
    )), v_submit_user, v_submitter, 'production-reject-save-2'
  );
  IF v_result->>'status' <> 'saved' OR v_result->>'version' <> '4' THEN
    RAISE EXCEPTION 'real rejected edit failed: %', v_result;
  END IF;
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_reject_batch, v_tenant, 4, v_submit_user, v_submitter,
    'production-reject-submit-2'
  );
  SELECT instance.id, (instance.context->>'approval_round')::integer
  INTO v_new_instance, v_round
  FROM public.workflow_instances AS instance
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_reject_batch::text
    AND instance.status = 'running';
  IF v_new_instance = v_old_instance OR v_round <> 2 THEN
    RAISE EXCEPTION 'rejected resubmit did not create round 2 instance';
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_reject_batch, v_old_task, 'reject', 'Task9 rejected',
    jsonb_build_object('source', 'production'), v_review_user, v_reviewer,
    'production-reject-review'
  );
  IF v_result->>'status' <> 'rejected' OR v_result->>'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'old successful task did not replay: %', v_result;
  END IF;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_reject_batch, v_old_task, 'approve', NULL,
      jsonb_build_object('source', 'production'), v_review_user, v_reviewer,
      'production-reject-review');
    RAISE EXCEPTION 'different old successful payload unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_reject_batch, v_old_task, 'reject', 'Task9 rejected',
      jsonb_build_object('source', 'production'), v_review_user, v_reviewer,
      'production-reject-old-task-new-key');
    RAISE EXCEPTION 'old successful task advanced under a new key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE' THEN RAISE; END IF;
  END;

  v_result := public.save_supplier_purchase_batch_draft(
    v_cancel_batch, v_tenant, v_project, 0, 'Task9 cancel flow', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-cancel-save'
  );
  v_result := public.cancel_supplier_purchase_batch(
    v_cancel_batch, v_tenant, 1, 'Task9 cancel',
    v_submit_user, v_submitter, 'production-cancel'
  );
  IF v_result->>'status' <> 'cancelled'
    OR v_result->'batch'->>'status' <> 'cancelled'
  THEN RAISE EXCEPTION 'real cancel failed: %', v_result; END IF;
END
$integration$;

SELECT 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_WITHDRAW_PRODUCTION_INTEGRATION_OK';
