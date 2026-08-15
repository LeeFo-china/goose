-- Rollback: forward-only. If the allocation conflict lookup is removed in a
-- later release, drop this index only through a new migration after confirming
-- no deployed function still queries the tenant idempotency scope.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE INDEX IF NOT EXISTS supplier_command_events_tenant_allocation_conflict_idx
ON public.supplier_command_events(tenant_id, idempotency_key)
WHERE command IN (
  'create_tenant_private_supplier',
  'create_tenant_shared_supplier_relationship',
  'create_tenant_supplier'
);

COMMIT;
