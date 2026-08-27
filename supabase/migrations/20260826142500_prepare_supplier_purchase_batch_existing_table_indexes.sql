-- gooes:migration-mode=nontransactional
-- gooes:expected-index=public.projects_name_purchase_batch_trgm_idx|public.projects|false|gin|name|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.finance_cost_categories_code_purchase_batch_trgm_idx|public.finance_cost_categories|false|gin|code|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.finance_cost_categories_name_purchase_batch_trgm_idx|public.finance_cost_categories|false|gin|name|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.supplier_purchase_requisitions_batch_supplier_generation_uidx|public.supplier_purchase_requisitions|true|btree|tenant_id,purchase_batch_id,split_generation,tenant_supplier_id|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.int4_ops,pg_catalog.uuid_ops|expression:(purchase_batch_id IS NOT NULL)
-- gooes:expected-index=public.supplier_purchase_orders_batch_supplier_uidx|public.supplier_purchase_orders|true|btree|tenant_id,purchase_batch_id,tenant_supplier_id|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.uuid_ops|expression:(purchase_batch_id IS NOT NULL)
-- gooes:expected-index=public.supplier_purchase_requisitions_batch_generation_idx|public.supplier_purchase_requisitions|false|btree|tenant_id,purchase_batch_id,split_generation,id|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.int4_ops,pg_catalog.uuid_ops|expression:(purchase_batch_id IS NOT NULL)
-- gooes:expected-index=public.supplier_purchase_orders_batch_idx|public.supplier_purchase_orders|false|btree|tenant_id,purchase_batch_id,id|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.uuid_ops|expression:(purchase_batch_id IS NOT NULL)
-- Existing tables may already contain substantial data. These indexes must be
-- built outside a transaction so batch rollout does not hold write-blocking
-- ShareLock for the duration of index construction.
--
-- Failure/retry: the release runner validates relation ownership, uniqueness,
-- access method, ordered keys, opclasses, predicate, and all pg_index readiness
-- flags. It drops only a listed INVALID index concurrently before retrying.
-- Rollback: after disabling the matching batch endpoints, drop these seven
-- exact indexes concurrently. Keep pg_trgm because other features share it.

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  projects_name_purchase_batch_trgm_idx
ON public.projects
USING gin (name extensions.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  finance_cost_categories_code_purchase_batch_trgm_idx
ON public.finance_cost_categories
USING gin (code extensions.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  finance_cost_categories_name_purchase_batch_trgm_idx
ON public.finance_cost_categories
USING gin (name extensions.gin_trgm_ops);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_purchase_requisitions_batch_supplier_generation_uidx
ON public.supplier_purchase_requisitions(
  tenant_id,
  purchase_batch_id,
  split_generation,
  tenant_supplier_id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_purchase_orders_batch_supplier_uidx
ON public.supplier_purchase_orders(
  tenant_id,
  purchase_batch_id,
  tenant_supplier_id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_purchase_requisitions_batch_generation_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  purchase_batch_id,
  split_generation,
  id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_purchase_orders_batch_idx
ON public.supplier_purchase_orders(tenant_id, purchase_batch_id, id)
WHERE purchase_batch_id IS NOT NULL;

RESET statement_timeout;
RESET lock_timeout;
