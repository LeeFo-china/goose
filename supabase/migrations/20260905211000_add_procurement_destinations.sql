-- Stage A: add procurement destination structure while keeping warehouse
-- procurement disabled at the application command layer.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.supplier_purchase_batches
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_purchase_batches
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_purchase_batches
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_purchase_batches_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_purchase_batches_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_purchase_batches_tenant_warehouse_updated_idx
ON public.supplier_purchase_batches(
  tenant_id,
  warehouse_id,
  updated_at DESC,
  id DESC
)
WHERE destination_type = 'warehouse';

ALTER TABLE public.supplier_purchase_requisitions
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_purchase_requisitions
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_purchase_requisitions
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_purchase_requisitions_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_purchase_requisitions_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_purchase_requisitions_tenant_warehouse_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  warehouse_id,
  updated_at DESC,
  id DESC
)
WHERE destination_type = 'warehouse';

ALTER TABLE public.supplier_purchase_orders
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

ALTER TABLE public.supplier_purchase_orders
DISABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

UPDATE public.supplier_purchase_orders
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_purchase_orders
ENABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

ALTER TABLE public.supplier_purchase_orders
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_purchase_orders_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_purchase_orders_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_purchase_orders_tenant_warehouse_updated_idx
ON public.supplier_purchase_orders(
  tenant_id,
  warehouse_id,
  updated_at DESC,
  id DESC
)
WHERE destination_type = 'warehouse';

COMMENT ON COLUMN public.tenant_supplier_settings.warehouse_procurement_enabled
IS 'Controls future warehouse procurement writes; Stage A keeps the gate disabled by default.';

COMMIT;
