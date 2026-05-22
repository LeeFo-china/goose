-- 客户开始设计前需要在客户上记录主房产，用于销售到项目的衔接。
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS property_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_property_id_fkey'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_property_id_fkey
    FOREIGN KEY (property_id)
    REFERENCES public.properties(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_property_id
ON public.customers(property_id);
