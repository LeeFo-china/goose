-- gooes:migration-mode=nontransactional
-- gooes:expected-index=public.marketing_events_material_subject_erase_idx|public.marketing_events|false|btree|tenant_id,douyin_miniapp_installation_id,subject_hash|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.text_ops|null
-- marketing_events is an existing high-write table. Build the tenant-scoped
-- privacy-erasure lookup without taking the write-blocking lock of a regular
-- index build. The release marker cannot represent this feature's partial event
-- predicate, so this reviewed index is intentionally non-partial.
-- Failure/retry: release tooling verifies readiness and removes only this named
-- INVALID index concurrently before retrying.
-- Rollback: forward-only. Retain the additive index after an API rollback; any
-- removal requires a separately reviewed concurrent-index migration.

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  marketing_events_material_subject_erase_idx
ON public.marketing_events(tenant_id, douyin_miniapp_installation_id, subject_hash);

RESET statement_timeout;
RESET lock_timeout;
