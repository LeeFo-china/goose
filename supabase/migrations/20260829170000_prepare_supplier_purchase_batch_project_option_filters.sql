-- gooes:migration-mode=nontransactional
-- gooes:expected-index=public.projects_tenant_updated_id_purchase_batch_idx|public.projects|false|btree|tenant_id,updated_at,id|pg_catalog.uuid_ops,pg_catalog.timestamptz_ops,pg_catalog.uuid_ops|null
-- Existing projects may already contain substantial data. Build this index
-- without a write-blocking ShareLock while the project option API stays live.
-- Failure/retry: release tooling validates pg_index readiness and removes only
-- this listed INVALID index concurrently before retrying.
-- Rollback: after reverting the filtered API revision, run
-- DROP INDEX CONCURRENTLY IF EXISTS public.projects_tenant_updated_id_purchase_batch_idx;

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  projects_tenant_updated_id_purchase_batch_idx
ON public.projects(tenant_id, updated_at DESC, id DESC);

RESET statement_timeout;
RESET lock_timeout;
