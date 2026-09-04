CREATE TABLE IF NOT EXISTS public.supplier_purchase_order_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  share_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  last_viewed_at timestamptz NULL,
  viewed_count integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz NULL,
  confirm_remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_share_links_order_tenant_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_order_supplier_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id, supplier_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_relationship_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_token_check
    CHECK (share_token ~ '^pos_[A-Za-z0-9_-]{32,}$'),
  CONSTRAINT supplier_purchase_order_share_links_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT supplier_purchase_order_share_links_idempotency_key_check
    CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 120),
  CONSTRAINT supplier_purchase_order_share_links_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT supplier_purchase_order_share_links_viewed_count_check
    CHECK (viewed_count >= 0),
  CONSTRAINT supplier_purchase_order_share_links_confirm_remark_check
    CHECK (
      confirm_remark IS NULL
      OR char_length(btrim(confirm_remark)) BETWEEN 1 AND 500
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_purchase_order_share_links_token_key
ON public.supplier_purchase_order_share_links(share_token);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_purchase_order_share_links_idempotency_key
ON public.supplier_purchase_order_share_links(
  tenant_id,
  supplier_purchase_order_id,
  created_by_employee_id,
  idempotency_key
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_order_status_idx
ON public.supplier_purchase_order_share_links(
  tenant_id,
  supplier_purchase_order_id,
  status,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_employee_created_idx
ON public.supplier_purchase_order_share_links(
  tenant_id,
  created_by_employee_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_active_expiry_idx
ON public.supplier_purchase_order_share_links(expires_at)
WHERE status = 'active';

DROP TRIGGER IF EXISTS supplier_purchase_order_share_links_updated_at
ON public.supplier_purchase_order_share_links;

CREATE TRIGGER supplier_purchase_order_share_links_updated_at
BEFORE UPDATE ON public.supplier_purchase_order_share_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_purchase_order_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_share_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_purchase_order_share_links
FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE
ON public.supplier_purchase_order_share_links
TO service_role;
