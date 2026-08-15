-- Rollback: forward-only. Before ownership-aware writes begin, disable the four rollout flags
-- in a forward migration and repair incompatible schema changes there. After new writes begin,
-- only disable those flags and apply another forward migration; never delete generated
-- ownership and tenant data or drop the columns, constraints, indexes, function, or triggers.
-- Schedule a release window for the three master-table backfills and five ownership indexes.
-- A timeout is fail-closed: the entire transaction rolls back; never repair the database manually.
-- PostgreSQL may expose the platform default to existing rows without rewriting them, so each
-- deterministic backfill intentionally updates only rows whose ownership_scope remains NULL.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.suppliers
ADD COLUMN ownership_scope text NULL DEFAULT 'platform',
ADD COLUMN owner_tenant_id uuid NULL;

ALTER TABLE public.suppliers
ADD CONSTRAINT suppliers_owner_tenant_fkey
  FOREIGN KEY (owner_tenant_id)
  REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.suppliers
SET ownership_scope = 'platform', owner_tenant_id = NULL
WHERE ownership_scope IS NULL;

ALTER TABLE public.suppliers
ALTER COLUMN ownership_scope SET NOT NULL;

ALTER TABLE public.suppliers
ADD CONSTRAINT suppliers_ownership_check CHECK (
  (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
  OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
);

ALTER TABLE public.catalog_categories
ADD COLUMN ownership_scope text NULL DEFAULT 'platform',
ADD COLUMN owner_tenant_id uuid NULL;

ALTER TABLE public.catalog_categories
ADD CONSTRAINT catalog_categories_owner_tenant_fkey
  FOREIGN KEY (owner_tenant_id)
  REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.catalog_categories
SET ownership_scope = 'platform', owner_tenant_id = NULL
WHERE ownership_scope IS NULL;

ALTER TABLE public.catalog_categories
ALTER COLUMN ownership_scope SET NOT NULL;

ALTER TABLE public.catalog_categories
ADD CONSTRAINT catalog_categories_ownership_check CHECK (
  (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
  OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
);

ALTER TABLE public.catalog_brands
ADD COLUMN ownership_scope text NULL DEFAULT 'platform',
ADD COLUMN owner_tenant_id uuid NULL;

ALTER TABLE public.catalog_brands
ADD CONSTRAINT catalog_brands_owner_tenant_fkey
  FOREIGN KEY (owner_tenant_id)
  REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.catalog_brands
SET ownership_scope = 'platform', owner_tenant_id = NULL
WHERE ownership_scope IS NULL;

ALTER TABLE public.catalog_brands
ALTER COLUMN ownership_scope SET NOT NULL;

ALTER TABLE public.catalog_brands
ADD CONSTRAINT catalog_brands_ownership_check CHECK (
  (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
  OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
);

ALTER TABLE public.supplier_products
ADD COLUMN ownership_scope text NULL,
ADD COLUMN owner_tenant_id uuid NULL;

ALTER TABLE public.supplier_products
ADD CONSTRAINT supplier_products_owner_tenant_fkey
  FOREIGN KEY (owner_tenant_id)
  REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_products
ADD CONSTRAINT supplier_products_ownership_check CHECK (
  (ownership_scope IS NULL AND owner_tenant_id IS NULL)
  OR (
    ownership_scope IS NOT NULL
    AND (
      (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
      OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
    )
  )
);

ALTER TABLE public.supplier_skus
ADD COLUMN ownership_scope text NULL,
ADD COLUMN owner_tenant_id uuid NULL;

ALTER TABLE public.supplier_skus
ADD CONSTRAINT supplier_skus_owner_tenant_fkey
  FOREIGN KEY (owner_tenant_id)
  REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_skus
ADD CONSTRAINT supplier_skus_ownership_check CHECK (
  (ownership_scope IS NULL AND owner_tenant_id IS NULL)
  OR (
    ownership_scope IS NOT NULL
    AND (
      (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
      OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
    )
  )
);

CREATE FUNCTION public.guard_supplier_ownership_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
    OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_ownership_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_suppliers_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id
ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE TRIGGER tr_catalog_categories_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id
ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE TRIGGER tr_catalog_brands_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id
ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE INDEX suppliers_ownership_lookup_idx
ON public.suppliers(
  ownership_scope,
  owner_tenant_id,
  operational_status,
  id
);

CREATE INDEX catalog_categories_ownership_lookup_idx
ON public.catalog_categories(
  ownership_scope,
  owner_tenant_id,
  parent_id,
  status,
  sort_order,
  id
);

CREATE INDEX catalog_brands_ownership_lookup_idx
ON public.catalog_brands(
  ownership_scope,
  owner_tenant_id,
  status,
  sort_order,
  id
);

CREATE INDEX supplier_products_ownership_lookup_idx
ON public.supplier_products(
  ownership_scope,
  owner_tenant_id,
  supplier_id,
  status,
  id
);

CREATE INDEX supplier_skus_ownership_lookup_idx
ON public.supplier_skus(
  ownership_scope,
  owner_tenant_id,
  supplier_id,
  status,
  id
);

ALTER TABLE public.tenant_supplier_settings
ADD COLUMN ownership_reads_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN private_supplier_writes_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN private_catalog_writes_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN procurement_snapshot_v1_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_supplier_settings
ADD CONSTRAINT tenant_supplier_settings_ownership_rollout_order_check CHECK (
  NOT (
    (
      NOT module_enabled
      AND (
        ownership_reads_enabled
        OR private_supplier_writes_enabled
        OR private_catalog_writes_enabled
        OR procurement_snapshot_v1_enabled
      )
    )
    OR (
      private_supplier_writes_enabled
      AND NOT ownership_reads_enabled
    )
    OR (
      private_catalog_writes_enabled
      AND NOT (
        ownership_reads_enabled
        AND private_supplier_writes_enabled
      )
    )
    OR (
      procurement_snapshot_v1_enabled
      AND NOT (
        ownership_reads_enabled
        AND private_supplier_writes_enabled
        AND private_catalog_writes_enabled
      )
    )
  )
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.suppliers
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers
  TO service_role;

REVOKE ALL ON TABLE public.catalog_categories
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_categories
  TO service_role;

REVOKE ALL ON TABLE public.catalog_brands
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_brands
  TO service_role;

REVOKE ALL ON TABLE public.supplier_products
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_products
  TO service_role;

REVOKE ALL ON TABLE public.supplier_skus
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_skus
  TO service_role;

REVOKE ALL ON TABLE public.tenant_supplier_settings
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_supplier_settings
  TO service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  ('platform.supplier-product.manage', '管理平台共享商品', 'platform_supplier', 'supplier_product', 'manage', '维护平台共享商品和 SKU', 'active'),
  ('supplier.master.manage', '管理本租户私有供应商主档', 'supplier', 'master', 'manage', '维护当前租户私有供应商主档', 'active'),
  ('supplier.catalog.manage', '管理本租户分类、品牌和规格模板', 'supplier', 'catalog', 'manage', '维护当前租户私有分类、品牌和规格模板', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code = 'platform.supplier-product.manage'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'supplier.master.manage',
    'supplier.catalog.manage'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
