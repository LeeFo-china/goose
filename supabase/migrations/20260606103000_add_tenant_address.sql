ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.tenants.address IS '装修公司真实办公地址或门店地址，用于 visitor 本地服务商列表展示';
