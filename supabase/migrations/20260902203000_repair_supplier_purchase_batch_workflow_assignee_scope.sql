-- Repair historical supplier purchase batch approval nodes that were pinned
-- to system_admin instead of using the intended permission-based candidates.
-- Rollback: forward-fix only. Re-publish the supplier_purchase_batch_approval
-- workflow from corrected nodes if a tenant intentionally needs custom roles.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

UPDATE public.workflow_nodes AS node
SET config = node.config - 'assignee_id'
FROM public.workflow_definitions AS definition
WHERE definition.id = node.definition_id
  AND definition.tenant_id = node.tenant_id
  AND definition.workflow_key = 'supplier_purchase_batch_approval'
  AND node.node_type = 'approval'
  AND node.config->>'assignee_rule' = 'role'
  AND node.config->>'assignee_id' = 'system_admin'
  AND node.config->>'assignee_permission_code' IN (
    'supplier.purchase-requisition.approve',
    'finance.budget.manage'
  );

WITH repaired_versions AS (
  SELECT
    version.id,
    version.tenant_id,
    pg_catalog.jsonb_agg(
      CASE
        WHEN node->>'node_type' = 'approval'
          AND (node->'config')->>'assignee_rule' = 'role'
          AND (node->'config')->>'assignee_id' = 'system_admin'
          AND (node->'config')->>'assignee_permission_code' IN (
            'supplier.purchase-requisition.approve',
            'finance.budget.manage'
          )
        THEN node - 'config' || pg_catalog.jsonb_build_object(
          'config',
          (node->'config') - 'assignee_id'
        )
        ELSE node
      END
      ORDER BY snapshot_node.ordinality
    ) AS nodes
  FROM public.workflow_versions AS version
  JOIN public.workflow_definitions AS definition
    ON definition.id = version.definition_id
   AND definition.tenant_id = version.tenant_id
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) WITH ORDINALITY AS snapshot_node(node, ordinality)
  WHERE definition.workflow_key = 'supplier_purchase_batch_approval'
    AND version.status = 'published'
    AND version.snapshot->>'workflow_key' = 'supplier_purchase_batch_approval'
  GROUP BY version.id, version.tenant_id
  HAVING pg_catalog.bool_or(
    node->>'node_type' = 'approval'
    AND (node->'config')->>'assignee_rule' = 'role'
    AND (node->'config')->>'assignee_id' = 'system_admin'
    AND (node->'config')->>'assignee_permission_code' IN (
      'supplier.purchase-requisition.approve',
      'finance.budget.manage'
    )
  )
)
UPDATE public.workflow_versions AS version
SET snapshot = pg_catalog.jsonb_set(
  version.snapshot,
  '{nodes}',
  repaired_versions.nodes,
  true
)
FROM repaired_versions
WHERE version.id = repaired_versions.id
  AND version.tenant_id = repaired_versions.tenant_id;

COMMIT;
