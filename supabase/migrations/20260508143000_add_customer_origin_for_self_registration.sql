ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_origin text NOT NULL DEFAULT 'employee_created',
  ADD COLUMN IF NOT EXISTS self_registered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_customer_origin_check'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_origin_check
      CHECK (
        customer_origin IN (
          'employee_created',
          'visitor_self_registered',
          'h5_lead_converted',
          'imported',
          'system_created'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.customers.customer_origin IS '客户档案创建渠道';
COMMENT ON COLUMN public.customers.self_registered_at IS '访客自助注册创建客户的时间';
COMMENT ON COLUMN public.customers.claimed_at IS '已存在客户被当前微信/auth_user 认领绑定的时间';
