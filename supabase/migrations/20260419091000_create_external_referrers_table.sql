CREATE TABLE IF NOT EXISTS public.external_referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  bank_name text,
  bank_account text,
  wechat_account text,
  alipay_account text,
  status text NOT NULL DEFAULT 'active',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_referrers
DROP CONSTRAINT IF EXISTS external_referrers_status_check;

ALTER TABLE public.external_referrers
ADD CONSTRAINT external_referrers_status_check
CHECK (
  status = ANY (
    ARRAY[
      'active'::text,
      'inactive'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_external_referrers_status
ON public.external_referrers(status);

CREATE INDEX IF NOT EXISTS idx_external_referrers_phone
ON public.external_referrers(phone)
WHERE phone IS NOT NULL;

COMMENT ON TABLE public.external_referrers IS '外部介绍人主档';
COMMENT ON COLUMN public.external_referrers.status IS '介绍人状态: active/inactive';

DROP TRIGGER IF EXISTS tr_external_referrers_updated_at ON public.external_referrers;

CREATE TRIGGER tr_external_referrers_updated_at
  BEFORE UPDATE ON public.external_referrers
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
