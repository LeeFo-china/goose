DROP INDEX IF EXISTS public.employees_openid_unique;

ALTER TABLE public.employees
DROP COLUMN IF EXISTS openid;

CREATE TABLE IF NOT EXISTS public.sms_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  scene text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expired_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip text NULL
);

CREATE INDEX IF NOT EXISTS sms_verification_codes_phone_scene_idx
ON public.sms_verification_codes (phone, scene);

CREATE INDEX IF NOT EXISTS sms_verification_codes_created_at_idx
ON public.sms_verification_codes (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS employees_phone_unique
ON public.employees (phone)
WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique
ON public.customers (phone)
WHERE phone IS NOT NULL;
