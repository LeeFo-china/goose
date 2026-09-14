-- Designer republishing omitted subject_type after the 20260902202000 repair.
-- Repair only published purchase batch versions with the expected workflow key.
-- Rollback: forward-fix only. Restore affected snapshots from a backup if needed;
-- do not delete workflow versions or change the active version pointer.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

UPDATE public.workflow_versions AS version
SET snapshot = pg_catalog.jsonb_set(
  version.snapshot,
  '{subject_type}',
  pg_catalog.to_jsonb('supplier_purchase_batch'::text),
  true
)
FROM public.workflow_definitions AS definition
WHERE definition.id = version.definition_id
  AND definition.tenant_id = version.tenant_id
  AND definition.workflow_key = 'supplier_purchase_batch_approval'
  AND version.status = 'published'
  AND version.snapshot->>'workflow_key' = 'supplier_purchase_batch_approval'
  AND version.snapshot->>'subject_type' IS DISTINCT FROM
    'supplier_purchase_batch';

COMMIT;
