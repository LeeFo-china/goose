-- Phase 0 inventory for legacy state-machine migration.
-- Read-only SQL. Do not include DDL/DML in this file.

-- 1. Legacy state-machine tables and columns.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name IN ('status', 'current_step', 'current_step_role')
    OR table_name IN (
      'customer_status_transition_logs',
      'project_status_transition_logs',
      'expense_request_approval_chains'
    )
  )
ORDER BY table_name, ordinal_position;

-- 2. Legacy state-machine indexes and status/current_step related indexes.
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname ILIKE '%status%'
    OR indexname ILIKE '%current_step%'
    OR tablename IN (
      'customer_status_transition_logs',
      'project_status_transition_logs',
      'expense_request_approval_chains'
    )
  )
ORDER BY tablename, indexname;

-- 3. Legacy and workflow functions for final cleanup planning.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND (
    proname ILIKE '%status%'
    OR proname ILIKE '%construction_transition%'
    OR proname ILIKE '%workflow%'
  )
ORDER BY proname, args;

-- 4. Legacy table row counts.
SELECT 'customer_status_transition_logs' AS object_name, count(*) AS row_count
FROM public.customer_status_transition_logs
UNION ALL
SELECT 'project_status_transition_logs' AS object_name, count(*) AS row_count
FROM public.project_status_transition_logs
UNION ALL
SELECT 'expense_request_approval_chains' AS object_name, count(*) AS row_count
FROM public.expense_request_approval_chains
ORDER BY object_name;

-- 5. Active customer subjects missing workflow instances.
SELECT c.tenant_id, count(*) AS missing_count
FROM public.customers c
LEFT JOIN public.workflow_instances wi
  ON wi.tenant_id = c.tenant_id
 AND wi.subject_type = 'customer'
 AND wi.subject_id = c.id::text
WHERE c.invalidated_at IS NULL
  AND wi.id IS NULL
GROUP BY c.tenant_id
ORDER BY c.tenant_id;

-- 6. Project subjects missing workflow instances.
SELECT p.tenant_id, count(*) AS missing_count
FROM public.projects p
LEFT JOIN public.workflow_instances wi
  ON wi.tenant_id = p.tenant_id
 AND wi.subject_type = 'project'
 AND wi.subject_id = p.id::text
WHERE wi.id IS NULL
GROUP BY p.tenant_id
ORDER BY p.tenant_id;

-- 7. Pending expense approval-chain nodes missing workflow tasks.
SELECT count(*) AS missing_task_count
FROM public.expense_request_approval_chains chain
LEFT JOIN public.workflow_instances wi
  ON wi.tenant_id = chain.tenant_id
 AND wi.subject_type = 'expense_request'
 AND wi.subject_id = chain.expense_request_id::text
LEFT JOIN public.workflow_tasks task
  ON task.tenant_id = chain.tenant_id
 AND task.instance_id = wi.id
 AND task.status = 'pending'
WHERE chain.status IN ('pending', 'current')
  AND task.id IS NULL;
