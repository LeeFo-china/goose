ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.customers
SET updated_at = COALESCE(created_at::timestamptz, now())
WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS tr_customers_updated_at ON public.customers;
CREATE TRIGGER tr_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS customers_tenant_updated_at_idx
ON public.customers(tenant_id, updated_at DESC);

COMMENT ON COLUMN public.customers.updated_at IS '客户记录更新时间';
